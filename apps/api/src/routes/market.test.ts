import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WORLD_START } from '@portfolio-league/engine';

import { type Clock, worldTime } from '../clock.ts';
import { worldFeed } from '../market/world-feed.ts';
import { memoryStore } from '../store/memory.ts';
import { pausedAt, testApp, TEST_WORLD } from '../testing.ts';

const json = async (response: Response) => (await response.json()) as any;

const SATURDAY = Date.UTC(2026, 10, 14, 10, 0);
const FRIDAY_AFTER_ALL_CLOSES = Date.UTC(2026, 10, 13, 22, 0);

describe('world clock', () => {
  it('runs from its anchor at its speed', () => {
    const clock: Clock = { anchorWorld: 1000, anchorReal: 50, speed: 7, paused: false };
    assert.equal(worldTime(clock, 60), 1070);
  });

  it('stands still when paused', () => {
    const clock: Clock = { anchorWorld: 1000, anchorReal: 50, speed: 7, paused: true };
    assert.equal(worldTime(clock, 9999), 1000);
  });

  it('starts once, and keeps its anchor after that', async () => {
    const store = memoryStore();
    const first = await store.getClock(100);
    assert.deepEqual(await store.getClock(900), first);
  });
});

describe('market', () => {
  it('lists 20 securities from both markets, with prices', async () => {
    const body = await json(await testApp().request('/api/market'));
    assert.equal(body.securities.length, 20);
    for (const market of ['TASE', 'US']) {
      assert.ok(body.securities.some((s: any) => s.market === market));
    }
    assert.ok(body.securities.every((s: any) => Number.isSafeInteger(s.price) && s.price > 0));
    assert.ok(Number.isSafeInteger(body.usdIls));
  });

  it('reports which markets are open', async () => {
    const body = await json(await testApp().request('/api/world'));
    assert.equal(body.worldTime, TEST_WORLD);
    assert.equal(body.markets.TASE.open, true);
    assert.equal(body.markets.US.open, false);
  });

  it('lets the CDN cache public data', async () => {
    const app = testApp();
    for (const path of ['/api/world', '/api/market', '/api/market/TAIX/history']) {
      assert.match((await app.request(path)).headers.get('Cache-Control') ?? '', /s-maxage=\d+/);
    }
  });

  it('needs no sign-in', async () => {
    assert.equal((await testApp().request('/api/market')).status, 200);
  });

  it('answers 404 for an unknown security', async () => {
    assert.equal((await testApp().request('/api/market/NOPE/history')).status, 404);
  });

  it('ends a chart exactly at the current price', async () => {
    const app = testApp();
    const history = await json(await app.request('/api/market/TAIX/history'));
    const market = await json(await app.request('/api/market'));
    const taix = market.securities.find((s: any) => s.id === 'TAIX');
    assert.ok(history.points.length > 1);
    assert.deepEqual(history.points.at(-1), { at: TEST_WORLD, price: taix.price });
  });
});

describe('charts', () => {
  it('start no earlier than the world does', async () => {
    const history = await json(await testApp().request('/api/market/TAIX/history'));
    assert.ok(history.points.every((point: { at: number }) => point.at >= WORLD_START));
  });

  it('cover at most five world days', async () => {
    const world = WORLD_START + 14 * 24 * 60 * 60 * 1000;
    const app = testApp({ store: memoryStore(pausedAt(world)) });
    const history = await json(await app.request('/api/market/TAIX/history'));
    assert.ok(history.points[0].at >= world - 5 * 24 * 60 * 60 * 1000);
    assert.ok(history.points.length > 20);
  });
});

describe('the future stays secret', () => {
  it('never asks the feed for a time later than world time', async () => {
    const real = worldFeed('test');
    let latest = 0;
    const seen = (ms: number) => {
      latest = Math.max(latest, ms);
      return ms;
    };
    const app = testApp({
      feed: {
        listings: real.listings,
        priceAt: (id, ms) => real.priceAt(id, seen(ms)),
        usdIlsAt: (ms) => real.usdIlsAt(seen(ms)),
        stepsBetween: real.stepsBetween,
      },
    });
    const headers = { Authorization: 'Bearer noa', 'Content-Type': 'application/json' };
    await app.request('/api/players', { method: 'POST', headers, body: '{"name":"Noa"}' });
    for (const path of ['/api/world', '/api/market', '/api/market/TAIX/history', '/api/me']) {
      await app.request(path, { headers });
    }
    assert.equal(latest, TEST_WORLD);
  });

  it('ignores any time the client sends', async () => {
    const app = testApp();
    const normal = await json(await app.request('/api/market'));
    const forged = await json(await app.request('/api/market?worldTime=99999999999999&at=9'));
    assert.deepEqual(forged, normal);
  });
});

describe('price feed', () => {
  const feed = worldFeed('seed');

  it('gives the same price for the same seed and time', () => {
    assert.equal(worldFeed('seed').priceAt('TAIX', TEST_WORLD), feed.priceAt('TAIX', TEST_WORLD));
  });

  it('gives different prices for a different seed', () => {
    assert.notEqual(worldFeed('other').priceAt('TAIX', TEST_WORLD), feed.priceAt('TAIX', TEST_WORLD));
  });

  it('sends only what the app needs for each listing', () => {
    assert.deepEqual(Object.keys(feed.listings[0] ?? {}).sort(), ['id', 'market', 'name', 'sector']);
  });

  it('holds prices still while a market is closed', () => {
    assert.equal(feed.priceAt('TAIX', SATURDAY), feed.priceAt('TAIX', SATURDAY + 3_600_000));
    assert.equal(feed.usdIlsAt(SATURDAY), feed.usdIlsAt(FRIDAY_AFTER_ALL_CLOSES));
  });
});

describe('portfolio value', () => {
  it('values a new player at their cash', async () => {
    const app = testApp();
    const headers = { Authorization: 'Bearer noa', 'Content-Type': 'application/json' };
    await app.request('/api/players', { method: 'POST', headers, body: '{"name":"Noa"}' });
    const me = await json(await app.request('/api/me', { headers }));
    assert.equal(me.value, me.cash);
    assert.equal(me.worldTime, TEST_WORLD);
    assert.deepEqual(me.positions, []);
  });

  it('values holdings at current prices, converting dollars', async () => {
    const store = memoryStore(pausedAt(TEST_WORLD));
    await store.createPlayer({
      uid: 'noa',
      name: 'Noa',
      createdAt: 0,
      cash: 0,
      holdings: { USIX: 1_000_000 },
      pendingOrders: [],
      nextDueAt: null,
      changedAt: 0,
    });
    const feed = worldFeed('test');
    const app = testApp({ store, feed });
    const me = await json(await app.request('/api/me', { headers: { Authorization: 'Bearer noa' } }));
    const expected = Math.floor(
      (feed.priceAt('USIX', TEST_WORLD) * feed.usdIlsAt(TEST_WORLD)) / 1_000_000,
    );
    assert.equal(me.value, expected);
    assert.deepEqual(me.positions, [{ securityId: 'USIX', units: 1_000_000, value: expected }]);
  });
});
