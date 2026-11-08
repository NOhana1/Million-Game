import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { worldFeed } from '../market/world-feed.ts';
import { settle } from '../services/settlement.ts';
import { honoursOf } from '../services/profile.ts';
import { memoryStore } from '../store/memory.ts';
import type { LeagueTable } from '../store/types.ts';
import { pausedAt, testApp, TEST_WORLD } from '../testing.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const headers = (uid: string) => ({ Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json' });
const json = async (response: Response) => (await response.json()) as any;

const week = (weekEndsAt: number, ...rows: [string, number, number][]) =>
  ({
    weekEndsAt,
    rows: rows.map(([id, rank, score]) => ({ id, name: id, rank, score, division: 'bronze' })),
  }) as unknown as LeagueTable;

describe('honours', () => {
  const weeks = [week(1, ['a', 1, 90], ['b', 4, 40]), week(2, ['a', 3, 70]), week(3, ['a', 8, 20])];

  it('counts wins, top 3 places and the best result', () => {
    assert.deepEqual(honoursOf(weeks, 'a'), {
      weeksPlayed: 3,
      wins: 1,
      top3: 2,
      bestRank: 1,
      bestScore: 90,
      beatMarket: 0,
      movedUp: 0,
    });
  });

  it('gives a new player nothing, not zeros that look like results', () => {
    assert.deepEqual(honoursOf(weeks, 'new'), {
      weeksPlayed: 0,
      wins: 0,
      top3: 0,
      bestRank: null,
      bestScore: null,
      beatMarket: 0,
      movedUp: 0,
    });
  });

  it('counts weeks that beat every index fund and moves up a division', () => {
    const table = (returnPpm: number, nextDivision: string, indexes: Record<string, number>) =>
      ({
        weekEndsAt: 1,
        indexes,
        rows: [{ id: 'a', name: 'a', rank: 2, score: 50, returnPpm, division: 'bronze', nextDivision }],
      }) as unknown as LeagueTable;
    const played = [
      table(30_000, 'silver', { ta35: 10_000, sp500: 20_000 }), // beat both, moved up
      table(15_000, 'bronze', { ta35: 10_000, sp500: 20_000 }), // beat only one
      table(5_000, 'bronze', {}), // no funds that week: nothing to beat
    ];
    const honours = honoursOf(played, 'a');
    assert.equal(honours.beatMarket, 1);
    assert.equal(honours.movedUp, 1);
  });
});

/** A player who bought, with the clock moved past the fill. */
async function trader() {
  const store = memoryStore(pausedAt(TEST_WORLD));
  const deps = { store };
  let app = testApp(deps);
  await app.request('/api/players', { method: 'POST', headers: headers('noa'), body: '{"name":"Noa"}' });
  for (const [securityId, amount] of [
    ['TAIX', 15_000_000],
    ['MRDN', 9_000_000],
  ] as const) {
    await app.request('/api/orders', {
      method: 'POST',
      headers: headers('noa'),
      body: JSON.stringify({ id: randomUUID(), securityId, side: 'buy', amount }),
    });
  }
  store.setClock(pausedAt(TEST_WORLD + 3 * DAY_MS));
  app = testApp(deps);
  return { app, store };
}

describe('portfolio history', () => {
  it('has nothing to show before the first fill', async () => {
    const app = testApp({ store: memoryStore(pausedAt(TEST_WORLD)) });
    await app.request('/api/players', { method: 'POST', headers: headers('noa'), body: '{"name":"Noa"}' });
    const history = await json(await app.request('/api/me/history', { headers: headers('noa') }));
    assert.deepEqual(history.points, []);
  });

  it('ends at exactly the value the player sees', async () => {
    const store = memoryStore(pausedAt(TEST_WORLD));
    const feed = worldFeed('test');
    const deps = { store, feed, now: () => 0 };
    const app = testApp(deps);
    await app.request('/api/players', { method: 'POST', headers: headers('noa'), body: '{"name":"Noa"}' });
    for (const [securityId, amount] of [
      ['TAIX', 15_000_000],
      ['MRDN', 9_000_000],
    ] as const) {
      await app.request('/api/orders', {
        method: 'POST',
        headers: headers('noa'),
        body: JSON.stringify({ id: randomUUID(), securityId, side: 'buy', amount }),
      });
    }
    store.setClock(pausedAt(TEST_WORLD + 3 * DAY_MS));
    await settle({
      ...deps,
      version: 'test',
      environment: 'test',
      verifyToken: async (token) => token,
      tickSecret: 'a',
      clockSecret: 'b',
    });

    const me = await json(await app.request('/api/me', { headers: headers('noa') }));
    assert.equal(Object.keys(me.holdings).length, 2);
    const { points } = await json(await app.request('/api/me/history?range=ALL', { headers: headers('noa') }));
    assert.ok(points.length > 5);
    assert.equal(points.at(-1).price, me.value);
    assert.ok(points.every((p: { price: number }) => p.price > 900_000_00));
  });

  it('needs a sign in, and refuses an unknown range', async () => {
    const { app } = await trader();
    assert.equal((await app.request('/api/me/history')).status, 401);
    assert.equal((await app.request('/api/me/history?range=9Y', { headers: headers('noa') })).status, 400);
  });
});

describe('watchlist', () => {
  const put = (app: ReturnType<typeof testApp>, ids: unknown) =>
    app.request('/api/me/watchlist', {
      method: 'PUT',
      headers: headers('noa'),
      body: JSON.stringify({ ids }),
    });

  it('saves the list on the player, without repeats', async () => {
    const { app } = await trader();
    assert.equal((await put(app, ['TAIX', 'MRDN', 'TAIX'])).status, 200);
    const me = await json(await app.request('/api/me', { headers: headers('noa') }));
    assert.deepEqual(me.watchlist, ['TAIX', 'MRDN']);
  });

  it('refuses a security that does not exist', async () => {
    const { app } = await trader();
    assert.equal((await put(app, ['NOPE'])).status, 404);
  });
});

describe('profile', () => {
  it('answers for a real player who has no table row yet', async () => {
    const app = testApp({ store: memoryStore(pausedAt(TEST_WORLD)) });
    await app.request('/api/players', { method: 'POST', headers: headers('noa'), body: '{"name":"Noa"}' });
    const profile = await json(await app.request('/api/players/noa/profile'));
    assert.equal(profile.name, 'Noa');
    assert.equal(profile.division, 'bronze');
    assert.equal(profile.thisWeek, null);
    assert.equal(JSON.stringify(profile).includes('holdings'), false);
  });

  it('says so when there is no such player', async () => {
    const app = testApp({ store: memoryStore(pausedAt(TEST_WORLD)) });
    assert.equal((await app.request('/api/players/ghost/profile')).status, 404);
  });
});
