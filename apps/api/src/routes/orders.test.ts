import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { MIN_ORDER, START_CASH } from '@portfolio-league/engine';

import { memoryStore } from '../store/memory.ts';
import { pausedAt, testApp, type TestApp, TEST_WORLD } from '../testing.ts';
import { MAX_PENDING_ORDERS } from './orders.ts';

const SHEKEL = 100;
const auth = (token = 'noa') => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

type Fields = { id?: unknown; securityId?: unknown; side?: unknown; amount?: unknown };

const send = (app: TestApp, fields: Fields = {}, token = 'noa') =>
  app.request('/api/orders', {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({
      id: randomUUID(),
      securityId: 'TAIX',
      side: 'buy',
      amount: 1_000 * SHEKEL,
      ...fields,
    }),
  });

const errorCode = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code;

const me = async (app: TestApp, token = 'noa') =>
  (await (await app.request('/api/me', { headers: auth(token) })).json()) as any;

async function joined(overrides: Parameters<typeof testApp>[0] = {}) {
  const app = testApp(overrides);
  await app.request('/api/players', { method: 'POST', headers: auth(), body: '{"name":"Noa"}' });
  return app;
}

describe('placing an order', () => {
  it('needs a sign-in and a player', async () => {
    const app = testApp();
    const response = await app.request('/api/orders', { method: 'POST', body: '{}' });
    assert.equal(response.status, 401);
    const noPlayer = await send(app);
    assert.equal(noPlayer.status, 404);
    assert.equal(await errorCode(noPlayer), 'PLAYER_NOT_FOUND');
  });

  it('takes a buy at the next close while the market is open', async () => {
    const app = await joined();
    const response = await send(app);
    assert.equal(response.status, 201);
    const order = (await response.json()) as any;
    assert.equal(order.status, 'pending');
    assert.equal(order.placedAt, TEST_WORLD);
    assert.equal(order.execution.kind, 'close');
    assert.equal(order.execution.at, Date.UTC(2026, 10, 9, 15, 30)); // 17:30 in Israel
  });

  it('takes a buy at the next open while the market is closed', async () => {
    const app = await joined();
    const order = (await (await send(app, { securityId: 'USIX' })).json()) as any;
    assert.equal(order.execution.kind, 'open');
    assert.equal(order.execution.at, Date.UTC(2026, 10, 9, 14, 30)); // 9:30 in New York
  });

  it('holds the cash of a pending buy, without changing the portfolio value', async () => {
    const app = await joined();
    await send(app);
    const player = await me(app);
    assert.equal(player.cash, START_CASH - 1_000 * SHEKEL);
    assert.equal(player.reserved, 1_000 * SHEKEL);
    assert.equal(player.value, START_CASH);
    assert.equal(player.pendingOrders.length, 1);
  });

  it('ignores a time or status sent by the client', async () => {
    const app = await joined();
    const response = await app.request('/api/orders', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        id: randomUUID(),
        securityId: 'TAIX',
        side: 'buy',
        amount: MIN_ORDER,
        placedAt: 1,
        status: 'filled',
      }),
    });
    const order = (await response.json()) as any;
    assert.equal(order.placedAt, TEST_WORLD);
    assert.equal(order.status, 'pending');
  });

  it('rejects malformed orders', async () => {
    const app = await joined();
    const bad: Fields[] = [
      { amount: 0 },
      { amount: -100 },
      { amount: 10.5 },
      { amount: '100' },
      { amount: 2 ** 60 },
      { side: 'short' },
      { id: 'not-a-uuid' },
      { securityId: 7 },
    ];
    for (const fields of bad) {
      assert.equal((await send(app, fields)).status, 400, JSON.stringify(fields));
    }
    assert.equal((await me(app)).cash, START_CASH);
  });

  it('rejects an unknown security', async () => {
    const response = await send(await joined(), { securityId: 'NOPE' });
    assert.equal(response.status, 404);
    assert.equal(await errorCode(response), 'UNKNOWN_SECURITY');
  });

  it('has no way to cancel', async () => {
    const app = await joined();
    const order = (await (await send(app)).json()) as { id: string };
    for (const method of ['DELETE', 'PUT', 'PATCH']) {
      const response = await app.request(`/api/orders/${order.id}`, { method, headers: auth() });
      assert.equal(response.status, 404, method);
    }
  });
});

describe('a double tap', () => {
  it('charges once when the same order arrives twice', async () => {
    const app = await joined();
    const id = randomUUID();
    assert.equal((await send(app, { id })).status, 201);
    const again = await send(app, { id });
    assert.equal(again.status, 200);
    assert.equal(((await again.json()) as { id: string }).id, id);
    assert.equal((await me(app)).cash, START_CASH - 1_000 * SHEKEL);
  });

  it('charges once when both arrive at the same moment', async () => {
    const app = await joined();
    const id = randomUUID();
    const statuses = (await Promise.all([send(app, { id }), send(app, { id })])).map((r) => r.status);
    assert.deepEqual(statuses.sort(), [200, 201]);
    assert.equal((await me(app)).pendingOrders.length, 1);
  });

  it('lets two players use the same order id', async () => {
    const app = await joined();
    await app.request('/api/players', {
      method: 'POST',
      headers: auth('dana'),
      body: '{"name":"Dana"}',
    });
    const id = randomUUID();
    assert.equal((await send(app, { id })).status, 201);
    assert.equal((await send(app, { id }, 'dana')).status, 201);
  });
});

describe('order rules', () => {
  it('allows exactly 20% in one security and blocks a single agora more', async () => {
    const limit = 200_000 * SHEKEL;
    const over = await send(await joined(), { amount: limit + 1 });
    assert.equal(over.status, 422);
    assert.equal(await errorCode(over), 'POSITION_LIMIT');
    assert.equal((await send(await joined(), { amount: limit })).status, 201);
  });

  it('counts pending buys towards the 20% limit', async () => {
    const app = await joined();
    await send(app, { amount: 120_000 * SHEKEL });
    const second = await send(app, { amount: 120_000 * SHEKEL });
    assert.equal(await errorCode(second), 'POSITION_LIMIT');
  });

  it('blocks buys beyond the available cash, so there is no leverage', async () => {
    const app = await joined();
    for (const securityId of ['TAIX', 'SHRN', 'HGLL', 'NGVS', 'YMSH']) {
      assert.equal((await send(app, { securityId, amount: 190_000 * SHEKEL })).status, 201);
    }
    const sixth = await send(app, { securityId: 'ARVA', amount: 190_000 * SHEKEL });
    assert.equal(await errorCode(sixth), 'INSUFFICIENT_CASH');
  });

  it('blocks selling what the player does not hold, so there is no short selling', async () => {
    const response = await send(await joined(), { side: 'sell' });
    assert.equal(response.status, 422);
    assert.equal(await errorCode(response), 'INSUFFICIENT_HOLDING');
  });

  it('sells a holding, and counts pending sells against it', async () => {
    const store = memoryStore(pausedAt(TEST_WORLD));
    await store.createPlayer({
      uid: 'noa',
      name: 'Noa',
      createdAt: 0,
      cash: 0,
      holdings: { TAIX: 100_000_000 }, // 100 units, well above ₪10,000
      pendingOrders: [],
      nextDueAt: null,
    });
    const app = testApp({ store });
    const position = (await me(app)).positions[0].value;
    assert.equal((await send(app, { side: 'sell', amount: position })).status, 201);
    const second = await send(app, { side: 'sell', amount: MIN_ORDER });
    assert.equal(await errorCode(second), 'INSUFFICIENT_HOLDING');
  });

  it('refuses an order below the minimum', async () => {
    const response = await send(await joined(), { amount: MIN_ORDER - 1 });
    assert.equal(response.status, 422);
    assert.equal(await errorCode(response), 'BELOW_MINIMUM');
  });

  it('sells a whole holding with "all"', async () => {
    const store = memoryStore(pausedAt(TEST_WORLD));
    await store.createPlayer({
      uid: 'noa',
      name: 'Noa',
      createdAt: 0,
      cash: 0,
      holdings: { TAIX: 100_000_000 },
      pendingOrders: [],
      nextDueAt: null,
    });
    const app = testApp({ store });
    const position = (await me(app)).positions[0].value;
    const response = await send(app, { side: 'sell', amount: 'all' });
    assert.equal(response.status, 201);
    assert.equal(((await response.json()) as { amount: number }).amount, position);
  });

  it('refuses "all" on a buy, and when nothing is held', async () => {
    const app = await joined();
    assert.equal((await send(app, { side: 'buy', amount: 'all' })).status, 422);
    assert.equal((await send(app, { side: 'sell', amount: 'all' })).status, 422);
    assert.equal((await me(app)).cash, START_CASH);
  });

  it('limits how many orders can wait at once', async () => {
    const app = await joined();
    for (let i = 0; i < MAX_PENDING_ORDERS; i++) {
      assert.equal((await send(app, { amount: MIN_ORDER })).status, 201);
    }
    const next = await send(app, { amount: MIN_ORDER });
    assert.equal(next.status, 409);
    assert.equal(await errorCode(next), 'TOO_MANY_PENDING');
  });
});

describe('order history', () => {
  const page = async (app: TestApp, query = '', token = 'noa') =>
    (await (await app.request(`/api/me/orders${query}`, { headers: auth(token) })).json()) as any;

  it('pages through every order exactly once, even with identical times', async () => {
    const app = await joined();
    const placed: string[] = [];
    for (let i = 0; i < 5; i++) {
      placed.push(((await (await send(app, { amount: MIN_ORDER })).json()) as { id: string }).id);
    }
    const seen: string[] = [];
    let after = '';
    for (let i = 0; i < 10; i++) {
      const result = await page(app, `?limit=2${after}`);
      seen.push(...result.orders.map((o: { id: string }) => o.id));
      if (!result.next) break;
      after = `&after=${result.next}`;
    }
    assert.deepEqual([...seen].sort(), [...placed].sort());
  });

  it('shows newest first', async () => {
    let realNow = 0;
    const store = memoryStore({ anchorWorld: TEST_WORLD, anchorReal: 0, speed: 1, paused: false });
    const app = await joined({ store, now: () => realNow });
    const first = ((await (await send(app)).json()) as { id: string }).id;
    realNow = 60_000;
    const second = ((await (await send(app)).json()) as { id: string }).id;
    const { orders } = await page(app);
    assert.deepEqual(orders.map((o: { id: string }) => o.id), [second, first]);
  });

  it('shows only the signed-in player their orders', async () => {
    const app = await joined();
    await send(app);
    assert.deepEqual((await page(app, '', 'dana')).orders, []);
  });

  it('rejects bad paging', async () => {
    const app = await joined();
    for (const query of ['?limit=0', '?limit=51', '?limit=x', '?after=bad']) {
      const response = await app.request(`/api/me/orders${query}`, { headers: auth() });
      assert.equal(response.status, 400, query);
    }
  });
});
