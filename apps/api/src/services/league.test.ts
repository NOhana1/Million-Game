import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { MAX_POSITION_PERCENT, portfolioValue, START_CASH, WORLD_START } from '@portfolio-league/engine';

import { createApp, type Deps } from '../app.ts';
import { quotesAt } from '../market/quotes.ts';
import { worldFeed } from '../market/world-feed.ts';
import { memoryStore, type MemoryStore } from '../store/memory.ts';
import type { LeagueTable, Member } from '../store/types.ts';
import { NO_LIMITS, pausedAt, TEST_WORLD } from '../testing.ts';
import { memberAccount } from './bots.ts';
import { settle } from './settlement.ts';

const HOUR = 3_600_000;
const TUESDAY = Date.UTC(2026, 10, 10, 18, 0);
const WEEK_END = Date.UTC(2026, 10, 13, 21, 0); // Friday 16:00 in New York
const NEXT_WEEK = Date.UTC(2026, 10, 16, 18, 0);
const feed = worldFeed('league-test');

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
    limits: NO_LIMITS,
  };
  return { store, deps, app: createApp(deps), at: (ms) => store.setClock(pausedAt(ms)) };
}

const headers = (uid: string) => ({ Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json' });
const join = (w: World, uid: string) =>
  w.app.request('/api/players', { method: 'POST', headers: headers(uid), body: `{"name":"${uid}"}` });
const buy = (w: World, uid: string, securityId = 'TAIX', id: string = randomUUID()) =>
  w.app.request('/api/orders', {
    method: 'POST',
    headers: headers(uid),
    body: JSON.stringify({ id, securityId, side: 'buy', amount: 10_000_000 }),
  });
const table = async (w: World) => (await (await w.app.request('/api/league')).json()) as LeagueTable;
const members = async (w: World) =>
  (await w.store.getShards()).flatMap((shard) => Object.values(shard.members));
const member = async (w: World, id: string) =>
  (await members(w)).find((m) => m.id === id) as Member;

async function runTo(w: World, ms: number) {
  w.at(ms);
  await settle(w.deps);
}

describe('bots', () => {
  it('fills a new league with 20 labelled bots', async () => {
    const w = world();
    await runTo(w, TUESDAY);
    const bots = await members(w);
    assert.equal(bots.length, 20);
    assert.ok(bots.every((bot) => bot.bot && bot.name.endsWith('(bot)')));
  });

  it('trades under the same rules as players', async () => {
    const w = world();
    await runTo(w, TUESDAY);
    const quotes = quotesAt(feed, TUESDAY);
    for (const bot of await members(w)) {
      assert.ok(bot.cash >= 0, bot.name);
      const value = portfolioValue(memberAccount(bot), quotes);
      assert.ok(value > START_CASH * 0.8 && value < START_CASH * 1.2, bot.name);
      for (const [id, units] of Object.entries(bot.holdings)) {
        assert.ok(units > 0, bot.name);
        const { price, fx } = quotes(id);
        const share = (units * price * fx) / 1e12 / value;
        assert.ok(share <= (MAX_POSITION_PERCENT + 3) / 100, `${bot.name} ${id}: ${share}`);
      }
    }
  });

  it('behave differently from each other', async () => {
    const w = world();
    await runTo(w, TUESDAY);
    const held = (await members(w)).map((bot) => Object.keys(bot.holdings).sort().join());
    assert.ok(new Set(held).size > 10);
    const keeper = (await members(w)).find((bot) => bot.name.startsWith('Cash Keeper')) as Member;
    assert.ok(keeper.cash > START_CASH * 0.8);
  });

  it('rotate at the start of a week, when their style does', async () => {
    const w = world();
    await runTo(w, WEEK_END - HOUR);
    const before = await member(w, 'bot-1-0');
    await runTo(w, NEXT_WEEK);
    const after = await member(w, 'bot-1-0');
    assert.notDeepEqual(Object.keys(after.holdings).sort(), Object.keys(before.holdings).sort());
  });
});

describe('the weekly table', () => {
  it('is empty and valid before anything has happened', async () => {
    const body = await table(world());
    assert.equal(body.total, 0);
    assert.deepEqual(body.rows, []);
  });

  it('needs no sign-in, and lets the CDN cache it', async () => {
    const response = await world().app.request('/api/league');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Cache-Control') ?? '', /s-maxage=30/);
  });

  it('ranks everyone best first, with scores from 0 to 100', async () => {
    const w = world();
    await runTo(w, TUESDAY);
    const { rows, total } = await table(w);
    assert.equal(total, 20);
    rows.forEach((row, index) => {
      assert.equal(row.rank, index + 1);
      assert.ok(row.score >= 0 && row.score <= 100);
      if (index > 0) assert.ok((rows[index - 1]?.score ?? 0) >= row.score);
    });
  });

  it('shows a player who holds something, and leaves out one who never did', async () => {
    const w = world();
    await join(w, 'trader');
    await join(w, 'saver');
    await buy(w, 'trader');
    await runTo(w, TUESDAY);
    const { rows } = await table(w);
    assert.ok(rows.some((row) => row.id === 'trader' && row.name === 'trader' && !row.bot));
    assert.ok(!rows.some((row) => row.id === 'saver'));
    assert.ok(await member(w, 'saver'));
  });

  it('measures a real return, from a real portfolio value', async () => {
    const w = world();
    await join(w, 'trader');
    await buy(w, 'trader');
    await runTo(w, TUESDAY);
    const { rows, updatedAt } = await table(w);
    const row = rows.find((r) => r.id === 'trader');
    const player = await w.store.getPlayer('trader');
    const value = portfolioValue(
      { cash: player?.cash ?? 0, holdings: player?.holdings ?? {}, orders: [] },
      quotesAt(feed, updatedAt),
    );
    assert.equal(row?.value, value);
    const expected = Math.trunc(((value - START_CASH) * 1_000_000) / START_CASH);
    assert.ok(Math.abs((row?.returnPpm ?? 0) - expected) <= 1);
  });

  it('counts cash held for a pending buy as part of the portfolio', async () => {
    const w = world();
    await join(w, 'trader');
    await buy(w, 'trader', 'USIX'); // fills at the US open, 14:30 UTC
    await buy(w, 'trader', 'TAIX'); // fills at the Tel Aviv close, 15:30 UTC
    await runTo(w, Date.UTC(2026, 10, 9, 15, 0));
    const player = await w.store.getPlayer('trader');
    assert.equal(player?.pendingOrders.length, 1);
    assert.equal(player?.cash, START_CASH - 20_000_000);
    assert.equal((await member(w, 'trader')).cash, START_CASH - 10_000_000);
  });

  it('measures drawdown on price steps between the checkpoints', async () => {
    const w = world();
    await runTo(w, WEEK_END - HOUR);
    const falls = (await members(w)).map((m) => m.week.drawdown.maxFallPpm);
    assert.ok(falls.some((fall) => fall > 0));
    const risky = await member(w, 'bot-1-0');
    const calm = await member(w, 'bot-2-0');
    assert.ok(risky.week.drawdown.maxFallPpm > calm.week.drawdown.maxFallPpm);
  });
});

describe('a new week', () => {
  it('closes at the Friday US close, keeps the result, and carries the portfolio', async () => {
    const w = world();
    await join(w, 'trader');
    await buy(w, 'trader');
    await runTo(w, WEEK_END - HOUR);
    const holdings = (await w.store.getPlayer('trader'))?.holdings;
    await runTo(w, NEXT_WEEK);

    const current = await table(w);
    assert.equal(current.previousWeekEndsAt, WEEK_END);
    assert.ok(current.weekEndsAt > WEEK_END);
    assert.deepEqual((await w.store.getPlayer('trader'))?.holdings, holdings);

    const response = await w.app.request(`/api/league/weeks/${WEEK_END}`);
    assert.equal(response.status, 200);
    const finished = (await response.json()) as LeagueTable;
    assert.equal(finished.weekEndsAt, WEEK_END);
    assert.ok(finished.rows.some((row) => row.id === 'trader'));

    const next = await member(w, 'trader');
    const finishedRow = finished.rows.find((row) => row.id === 'trader');
    assert.equal(next.week.startValue, finishedRow?.value);
  });

  it('answers 404 for a week that never finished', async () => {
    const w = world();
    assert.equal((await w.app.request('/api/league/weeks/123')).status, 404);
    assert.equal((await w.app.request('/api/league/weeks/abc')).status, 404);
  });

  it('measures a mid-week joiner from when they join', async () => {
    const w = world();
    await runTo(w, TUESDAY);
    await join(w, 'late');
    await runTo(w, TUESDAY + 24 * HOUR);
    const late = await member(w, 'late');
    assert.equal(late.week.startValue, START_CASH);
    assert.equal(late.week.endsAt, WEEK_END);
  });
});

describe('divisions', () => {
  const lastWeek = async (w: World) => {
    const { previousWeekEndsAt } = await table(w);
    const response = await w.app.request(`/api/league/weeks/${previousWeekEndsAt}`);
    return (await response.json()) as LeagueTable;
  };

  it('starts everyone in bronze', async () => {
    const w = world();
    await join(w, 'trader');
    await buy(w, 'trader');
    await runTo(w, TUESDAY);
    const { rows } = await table(w);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.division === 'bronze'));
  });

  it('moves the top quarter up when the week ends, and records it on the finished week', async () => {
    const w = world();
    await runTo(w, NEXT_WEEK);
    const finished = await lastWeek(w);
    const best = finished.rows.slice(0, Math.ceil(finished.total / 4));
    assert.ok(best.length > 0);
    assert.ok(best.every((row) => row.division === 'bronze' && row.nextDivision === 'silver'));
    assert.ok(finished.rows.slice(best.length).every((row) => row.nextDivision === 'bronze'));
    for (const row of best) assert.equal((await member(w, row.id)).division, 'silver');
  });

  it('shows the new division on the next table', async () => {
    const w = world();
    await runTo(w, NEXT_WEEK);
    const finished = await lastWeek(w);
    const { rows } = await table(w);
    for (const row of rows) {
      const result = finished.rows.find((r) => r.id === row.id);
      assert.equal(row.division, result?.nextDivision);
    }
  });

  it('leaves a player who held nothing where they are', async () => {
    const w = world();
    await join(w, 'saver');
    await runTo(w, TUESDAY);
    await runTo(w, NEXT_WEEK);
    assert.equal((await member(w, 'saver')).division, undefined);
  });

  it('moves players once, however many runs reach the same week', async () => {
    const onTime = world();
    await runTo(onTime, WEEK_END);
    await runTo(onTime, NEXT_WEEK);

    const late = world();
    await runTo(late, NEXT_WEEK);
    await settle(late.deps);
    await settle(late.deps);

    const divisions = async (w: World) =>
      Object.fromEntries((await members(w)).map((m) => [m.id, m.division]));
    assert.deepEqual(await divisions(late), await divisions(onTime));
  });

  it('moves players once when a run dies before saving the end of the week', async () => {
    const w = world();
    await runTo(w, WEEK_END - HOUR);
    const save = w.store.saveSlot;
    w.store.saveSlot = async () => {
      throw new Error('crashed');
    };
    w.at(NEXT_WEEK);
    await assert.rejects(settle(w.deps));
    w.store.saveSlot = save;
    await settle(w.deps);

    const clean = world();
    await runTo(clean, WEEK_END - HOUR);
    await runTo(clean, NEXT_WEEK);
    const divisions = async (x: World) =>
      Object.fromEntries((await members(x)).map((m) => [m.id, m.division]));
    assert.deepEqual(await divisions(w), await divisions(clean));
  });
});

describe('the goal', () => {
  it('stays through an order and its fill', async () => {
    const w = world();
    await join(w, 'trader');
    await w.store.setGoal('trader', 200_000_000);
    await buy(w, 'trader');
    await runTo(w, TUESDAY);
    const stored = await w.store.getPlayer('trader');
    assert.equal(stored?.goal, 200_000_000);
    assert.ok(Object.keys(stored?.holdings ?? {}).length > 0);
  });
});

describe('index funds on the table', () => {
  const fundReturn = (id: string, from: number, to: number) => {
    const start = quotesAt(feed, from)(id);
    const end = quotesAt(feed, to)(id);
    return end.price * end.fx / (start.price * start.fx) - 1;
  };

  it('has none before the first market event', async () => {
    assert.deepEqual((await table(world())).indexes, {});
  });

  it('measures each fund in shekels, from the start of the world in the first week', async () => {
    const w = world();
    await runTo(w, TUESDAY);
    const { indexes, updatedAt } = await table(w);
    assert.deepEqual(Object.keys(indexes).sort(), ['TAIX', 'USIX', 'USTX']);
    for (const id of Object.keys(indexes)) {
      const expected = fundReturn(id, WORLD_START, updatedAt as number);
      assert.ok(Math.abs((indexes[id] as number) / 1e6 - expected) < 1e-5, id);
    }
  });

  it('starts again from zero when a new week starts', async () => {
    const w = world();
    await runTo(w, WEEK_END);
    const { indexes } = await table(w);
    assert.ok(Object.values(indexes).every((ppm) => ppm === 0));
  });
});

describe('the league stays correct when things go wrong', () => {
  const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  const script = async (w: World) => {
    await join(w, 'a');
    await join(w, 'b');
    await buy(w, 'a', 'TAIX', ids[0]);
    await buy(w, 'b', 'USIX', ids[1]);
  };
  const state = async (w: World) => ({ table: await table(w), shards: await w.store.getShards() });

  it('gives the same table after a multi-day gap as running on time', async () => {
    const onTime = world();
    await script(onTime);
    for (let t = TEST_WORLD; t < TUESDAY + 24 * HOUR; t += HOUR) await runTo(onTime, t);
    await runTo(onTime, TUESDAY + 24 * HOUR);

    const late = world();
    await script(late);
    await runTo(late, TUESDAY + 24 * HOUR);

    assert.deepEqual(await state(late), await state(onTime));
  });

  it('gives the same table when a run dies after filling but before saving', async () => {
    const clean = world();
    await script(clean);
    await runTo(clean, TUESDAY);

    const crashed = world();
    await script(crashed);
    const realSave = crashed.store.saveSlot;
    let saves = 0;
    crashed.store.saveSlot = async (...args) => {
      saves += 1;
      if (saves === 2) throw new Error('crashed before saving');
      return realSave(...args);
    };
    crashed.at(TUESDAY);
    await assert.rejects(settle(crashed.deps));
    crashed.store.saveSlot = realSave;
    await settle(crashed.deps);

    assert.deepEqual(await state(crashed), await state(clean));
  });

  it('saves once per market event, however many players there are', async () => {
    const w = world();
    for (let i = 0; i < 30; i += 1) await join(w, `player-${i}`);
    let saves = 0;
    const realSave = w.store.saveSlot;
    w.store.saveSlot = async (...args) => {
      saves += 1;
      return realSave(...args);
    };
    await runTo(w, TUESDAY);
    const events = 7; // Mon: Tel Aviv open and close, US open and close. Tue: the same, up to 18:00
    assert.ok(saves <= events);
    assert.equal((await members(w)).filter((m) => !m.bot).length, 30);
  });

  it('starts the world from its first slot', async () => {
    const w = world(WORLD_START + 15 * 60_000);
    await settle(w.deps);
    assert.equal(await w.store.getCursor(), WORLD_START + 15 * 60_000);
    assert.equal((await members(w)).length, 20);
  });
});
