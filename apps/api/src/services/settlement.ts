// Fills due orders. Works through every market open and close since the stored cursor, oldest
// first, so a missed run and a five-day clock jump are the same code path. A fill depends only
// on the order's own execution time, so running late gives the same result as running on time.

import { nextMarketEvent, settleDueOrders } from '@portfolio-league/engine';
import { randomUUID } from 'node:crypto';

import type { Deps } from '../app.ts';
import { worldTime } from '../clock.ts';
import { quotesAt } from '../market/quotes.ts';
import { firstShards, finishSlot, replayToSlot } from './league.ts';
import { toAccount, withPending } from '../player.ts';
import type { Player, Settled } from '../store/types.ts';

const BUDGET_MS = 20_000; // the cron gives up at about 30 seconds
const LEASE_MS = 60_000; // outlasts the budget, and frees itself if a run crashes
const BATCH = 200;

export type SettlementResult = {
  status: 'idle' | 'busy' | 'finished' | 'partial';
  cursor: number;
  filled: number;
  failed: number;
};

type Run = { deps: Deps; deadline: number; filled: number; failed: Set<string> };

/** Only reads prices at each order's execution time, which is never later than `upTo`. */
export function settlePlayerUpTo(deps: Pick<Deps, 'feed'>, player: Player, upTo: number): Settled {
  const account = settleDueOrders(toAccount(player), upTo, (order) =>
    quotesAt(deps.feed, order.execution.at),
  );
  const pending = account.orders.filter((order) => order.status === 'pending');
  const filled = account.orders.filter((order) => order.status === 'filled');
  const changedAt = filled.length > 0 ? upTo : player.changedAt;
  return {
    filled,
    player: withPending(
      { ...player, cash: account.cash, holdings: account.holdings, changedAt },
      pending,
    ),
  };
}

const outOfTime = (run: Run) => run.deps.now() >= run.deadline;

/** False means the time ran out. A player who fails is skipped, so one can't stop everyone. */
async function fillDue(run: Run, upTo: number): Promise<boolean> {
  const { store } = run.deps;
  for (;;) {
    const due = await store.duePlayers(upTo, BATCH + run.failed.size);
    const uids = due.filter((uid) => !run.failed.has(uid));
    if (uids.length === 0) return true;

    for (const uid of uids) {
      if (outOfTime(run)) return false;
      try {
        run.filled += await store.settlePlayer(uid, (player) =>
          settlePlayerUpTo(run.deps, player, upTo),
        );
      } catch (error) {
        console.error(`Settlement failed for player ${uid}`, error);
        run.failed.add(uid);
      }
    }
  }
}

export async function settle(deps: Deps, budgetMs = BUDGET_MS): Promise<SettlementResult> {
  const { store } = deps;
  const startedAt = deps.now();
  const world = worldTime(await store.getClock(startedAt), startedAt);
  const saved = await store.getCursor();

  // Most runs find nothing to do, and this check keeps those from costing any writes.
  const slotDue = nextMarketEvent(saved) <= world;
  if (!slotDue && (await store.duePlayers(saved, 1)).length === 0) {
    return { status: 'idle', cursor: saved, filled: 0, failed: 0 };
  }

  const owner = randomUUID();
  const start = await store.startSettlement({ owner, realNow: startedAt, ttlMs: LEASE_MS });
  if (start === null) return { status: 'busy', cursor: saved, filled: 0, failed: 0 };

  const run: Run = { deps, deadline: startedAt + budgetMs, filled: 0, failed: new Set() };
  let cursor = start;
  let finished = false;
  try {
    // Orders that arrived just as their slot was being processed.
    finished = await fillDue(run, cursor);

    const stored = await store.getShards();
    const shards = stored.length > 0 ? stored : firstShards(start);
    let previousWeek = (await store.getTable())?.previousWeekEndsAt ?? null;

    while (finished) {
      const slot = nextMarketEvent(cursor);
      if (slot > world) break;

      replayToSlot(deps.feed, shards, cursor, slot);
      finished = await fillDue(run, slot);
      if (!finished) break; // nothing was saved, so the next run repeats this slot exactly

      const changed = await store.playersChangedSince(cursor);
      const save = finishSlot(deps.feed, shards, changed, slot, previousWeek);
      previousWeek = save.table?.previousWeekEndsAt ?? null;
      finished = await store.saveSlot(owner, slot, save);
      if (finished) cursor = slot;
    }
  } finally {
    await store.endSettlement(owner);
  }

  return {
    status: finished ? 'finished' : 'partial',
    cursor,
    filled: run.filled,
    failed: run.failed.size,
  };
}
