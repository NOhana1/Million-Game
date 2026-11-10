import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { type Order, START_CASH, WORLD_START } from '@portfolio-league/engine';

import type { Deps } from '../app.ts';
import type { Clock } from '../clock.ts';
import { quotesAt } from '../market/quotes.ts';
import { worldFeed } from '../market/world-feed.ts';
import { memoryStore, type MemoryStore } from '../store/memory.ts';
import type { Player } from '../store/types.ts';
import { pausedAt, TEST_WORLD } from '../testing.ts';
import { createApp } from '../app.ts';
import { settle } from './settlement.ts';

const HOUR = 3_600_000;
const SHEKEL = 100;
const TASE_CLOSE = Date.UTC(2026, 10, 9, 15, 30); // Mon 17:30 in Israel
const US_OPEN = Date.UTC(2026, 10, 9, 14, 30);
const feed = worldFeed('settlement-test');

type World = { store: MemoryStore; deps: Deps; app: ReturnType<typeof createApp>; at(ms: number): void };

function world(startAt = TEST_WORLD): World {
  const store = memoryStore(pausedAt(startAt));
  const deps: Deps = {
    version: 'test',
    environment: 'test',
    store,
    feed,
    verifyToken: async (token) => token,
    now: () => 0,
    tickSecret: 'test-secret',
    clockSecret: 'clock-secret',
  };
  return {
    store,
    deps,
    app: createApp(deps),
    at: (ms) => store.setClock(pausedAt(ms)),
  };
}

const headers = (uid: string) => ({ Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json' });

async function join(w: World, uid = 'noa') {
  const body = JSON.stringify({ name: `Player ${uid}` }); // names are unique
  await w.app.request('/api/players', { method: 'POST', headers: headers(uid), body });
}

async function order(w: World, fields: Record<string, unknown>, uid = 'noa', id: string = randomUUID()) {
  const response = await w.app.request('/api/orders', {
    method: 'POST',
    headers: headers(uid),
    body: JSON.stringify({ id, securityId: 'TAIX', side: 'buy', amount: 10_000 * SHEKEL, ...fields }),
  });
  return { response, body: (await response.json()) as any };
}

const player = async (w: World, uid = 'noa') => (await w.store.getPlayer(uid)) as Player;
const history = (w: World, uid = 'noa') => w.store.listOrders(uid, { limit: 50 });

describe('filling orders', () => {
  it('fills a buy at the close it was promised, at that moment\'s price', async () => {
    const w = world();
    await join(w);
    await order(w, {});
    w.at(TASE_CLOSE + HOUR);
    const result = await settle(w.deps);
    assert.equal(result.filled, 1);

    const [filled] = (await history(w)) as [Order];
    const { price } = quotesAt(feed, TASE_CLOSE)('TAIX');
    assert.equal(filled.status, 'filled');
    assert.equal(filled.fill?.price, price);
    assert.equal(filled.fill?.at, TASE_CLOSE);
    const saved = await player(w);
    assert.equal(saved.pendingOrders.length, 0);
    assert.equal(saved.nextDueAt, null);
    assert.ok((saved.holdings.TAIX ?? 0) > 0);
    assert.equal(saved.cash, START_CASH - 10_000 * SHEKEL);
  });

  it('does not fill before the order is due', async () => {
    const w = world();
    await join(w);
    await order(w, {});
    w.at(TASE_CLOSE - 1);
    assert.equal((await settle(w.deps)).filled, 0);
    assert.equal((await player(w)).pendingOrders.length, 1);
  });

  it('converts a US buy at the dollar rate of its execution', async () => {
    const w = world();
    await join(w);
    await order(w, { securityId: 'USIX' });
    w.at(US_OPEN + HOUR);
    await settle(w.deps);
    const [filled] = (await history(w)) as [Order];
    assert.equal(filled.fill?.fx, feed.usdIlsAt(US_OPEN));
    assert.equal(filled.fill?.price, feed.priceAt('USIX', US_OPEN));
  });

  it('pays a sale into cash, and keeps total value exact at the fill price', async () => {
    const w = world();
    await join(w);
    await order(w, {});
    w.at(TASE_CLOSE);
    await settle(w.deps);
    w.at(TASE_CLOSE + 17 * HOUR); // next morning, Tel Aviv is open
    const sale = await order(w, { side: 'sell', amount: 'all' });
    assert.equal(sale.response.status, 201);
    w.at(TASE_CLOSE + 24 * HOUR);
    await settle(w.deps);
    const saved = await player(w);
    assert.deepEqual(saved.holdings, {});
    const newest = (await history(w))[0] as Order;
    assert.equal(saved.cash, START_CASH - 10_000 * SHEKEL + (newest.fill?.value ?? 0));
  });

  it('never fills past what the world has reached', async () => {
    const seen: number[] = [];
    const w = world();
    w.deps.feed = {
      listings: feed.listings,
      priceAt: (id, ms) => (seen.push(ms), feed.priceAt(id, ms)),
      usdIlsAt: (ms) => (seen.push(ms), feed.usdIlsAt(ms)),
      stepsBetween: (from, to) => (seen.push(to), feed.stepsBetween(from, to)),
      pastPrices: () => [],
    };
    await join(w);
    await order(w, {});
    await order(w, { securityId: 'USIX' });
    seen.length = 0;
    const now = TASE_CLOSE + HOUR;
    w.at(now);
    await settle(w.deps);
    assert.ok(seen.length > 0);
    assert.ok(Math.max(...seen) <= now);
  });
});

describe('an order placed while an earlier one is filling', () => {
  it('waits, so it is never checked against out-of-date holdings', async () => {
    const w = world();
    await join(w);
    await order(w, {});
    w.at(TASE_CLOSE + HOUR);
    const early = await order(w, { securityId: 'SHRN' });
    assert.equal(early.response.status, 409);
    assert.equal(early.body.error.code, 'ORDER_SETTLING');
    await settle(w.deps);
    assert.equal((await order(w, { securityId: 'SHRN' })).response.status, 201);
  });
});

describe('no double execution', () => {
  it('fills once when two runs overlap', async () => {
    const w = world();
    await join(w);
    await order(w, {});
    w.at(TASE_CLOSE);
    const results = await Promise.all([settle(w.deps), settle(w.deps)]);
    assert.equal(results.reduce((sum, r) => sum + r.filled, 0), 1);
    assert.deepEqual(results.map((r) => r.status).sort(), ['busy', 'finished']);
    assert.equal((await player(w)).cash, START_CASH - 10_000 * SHEKEL);
  });

  it('changes nothing when run again', async () => {
    const w = world();
    await join(w);
    await order(w, {});
    w.at(TASE_CLOSE);
    await settle(w.deps);
    const after = await player(w);
    const orders = await history(w);
    const again = await settle(w.deps);
    assert.equal(again.status, 'idle');
    assert.deepEqual(await player(w), after);
    assert.deepEqual(await history(w), orders);
  });

  it('stays safe when a crashed run left its lease behind', async () => {
    const w = world();
    await join(w);
    await order(w, {});
    w.at(TASE_CLOSE);
    await w.store.startSettlement({ owner: 'crashed', realNow: 0, ttlMs: 60_000 });
    assert.equal((await settle(w.deps)).status, 'busy');
    w.deps.now = () => 120_000; // the lease has now expired
    assert.equal((await settle(w.deps)).filled, 1);
  });
});

describe('missed runs', () => {
  const script = async (w: World) => {
    await join(w, 'a');
    await join(w, 'b');
    const ids = { one: '00000000-0000-4000-8000-000000000001', two: '00000000-0000-4000-8000-000000000002' };
    await order(w, { amount: 150_000 * SHEKEL }, 'a', ids.one);
    await order(w, { securityId: 'USIX', amount: 150_000 * SHEKEL }, 'b', ids.two);
  };

  const snapshot = async (w: World) => ({
    a: await player(w, 'a'),
    b: await player(w, 'b'),
    aOrders: await history(w, 'a'),
    bOrders: await history(w, 'b'),
  });

  const END = TEST_WORLD + 3 * 24 * HOUR;

  it('gives the same result after a multi-day gap as running on time', async () => {
    const onTime = world();
    await script(onTime);
    for (let t = TEST_WORLD; t <= END; t += 20 * 60_000) {
      onTime.at(t);
      await settle(onTime.deps);
    }

    const late = world();
    await script(late);
    late.at(END);
    await settle(late.deps);

    assert.deepEqual(await snapshot(late), await snapshot(onTime));
    assert.equal(await late.store.getCursor(), await onTime.store.getCursor());
  });

  it('gives the same result after skipping 20 minutes across a close', async () => {
    const w = world();
    await join(w);
    await order(w, {});
    w.at(TASE_CLOSE + 20 * 60_000);
    assert.equal((await settle(w.deps)).filled, 1);
    assert.equal(((await history(w))[0] as Order).fill?.at, TASE_CLOSE);
  });

  it('works through slots oldest first, ending at the last one reached', async () => {
    const w = world();
    await join(w);
    await order(w, {});
    w.at(END);
    const result = await settle(w.deps);
    assert.equal(result.status, 'finished');
    assert.ok(result.cursor <= END);
    assert.ok(result.cursor > TASE_CLOSE);
    assert.ok(result.slots.length > 1);
    assert.deepEqual(result.slots, result.slots.toSorted((x, y) => x - y));
    assert.equal(result.slots.at(-1), result.cursor);
  });

  it('stops when out of time, and the next run resumes where it stopped', async () => {
    const w = world();
    await join(w, 'a');
    await join(w, 'b');
    await order(w, {}, 'a');
    await order(w, {}, 'b');
    w.at(TASE_CLOSE);

    let calls = 0;
    w.deps.now = () => (++calls > 1 ? 1_000 : 0); // out of time straight after the first check
    const first = await settle(w.deps, 500);
    assert.equal(first.status, 'partial');
    assert.equal(first.filled, 0);

    w.deps.now = () => 0;
    const second = await settle(w.deps);
    assert.equal(second.status, 'finished');
    assert.equal(second.filled, 2);
  });

  it('picks up an order that was accepted just after its slot was processed', async () => {
    const w = world();
    await join(w);
    w.at(TASE_CLOSE + HOUR);
    await settle(w.deps); // cursor is now past the close
    assert.ok((await w.store.getCursor()) >= TASE_CLOSE);

    // Same as a request that read the clock before the close, but landed after settlement.
    w.at(TEST_WORLD);
    await order(w, {});
    w.at(TASE_CLOSE + HOUR);
    assert.equal((await settle(w.deps)).filled, 1);
    assert.equal(((await history(w))[0] as Order).fill?.at, TASE_CLOSE);
  });

  it('keeps going when one player fails, and retries them later', async () => {
    const w = world();
    await join(w, 'a');
    await join(w, 'b');
    await order(w, {}, 'a');
    await order(w, {}, 'b');
    w.at(TASE_CLOSE);

    const real = w.store.settlePlayer;
    w.store.settlePlayer = async (uid, run) => {
      if (uid === 'a') throw new Error('broken');
      return real(uid, run);
    };
    const first = await settle(w.deps);
    assert.equal(first.filled, 1);
    assert.equal(first.failed, 1);

    w.store.settlePlayer = real;
    assert.equal((await settle(w.deps)).filled, 1);
  });
});

describe('the 20% limit at fill', () => {
  it('returns the cut-back part of a buy to cash', async () => {
    const w = world();
    await join(w);
    await order(w, { amount: 200_000 * SHEKEL });
    const before = await player(w);
    // A held portfolio that shrank: the buy no longer fits under 20% at the fill.
    before.cash = 0;
    before.pendingOrders[0]!.amount = 200_000 * SHEKEL;
    await w.store.settlePlayer('noa', () => ({ player: before, filled: [] }));
    w.at(TASE_CLOSE);
    await settle(w.deps);
    const [filled] = (await history(w)) as [Order];
    const saved = await player(w);
    assert.equal(filled.fill?.value, 40_000 * SHEKEL);
    assert.equal(filled.fill?.refund, 160_000 * SHEKEL);
    assert.equal(saved.cash, 160_000 * SHEKEL);
  });
});

describe('starting state', () => {
  it('reports idle with nothing to do and writes nothing', async () => {
    const w = world(WORLD_START);
    let writes = 0;
    const real = w.store.startSettlement;
    w.store.startSettlement = async (lease) => {
      writes += 1;
      return real(lease);
    };
    assert.equal((await settle(w.deps)).status, 'idle');
    assert.equal(writes, 0);
  });
});
