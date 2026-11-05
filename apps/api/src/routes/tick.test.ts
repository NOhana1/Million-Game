import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { memoryStore } from '../store/memory.ts';
import { pausedAt, testApp, TEST_WORLD } from '../testing.ts';
import { secretMatches } from './tick.ts';

const CLOSE = Date.UTC(2026, 10, 9, 15, 30);
const tick = (app: ReturnType<typeof testApp>, authorization?: string) =>
  app.request('/api/tick', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
  });

async function withDueOrder() {
  const store = memoryStore(pausedAt(TEST_WORLD));
  const app = testApp({ store });
  const headers = { Authorization: 'Bearer noa', 'Content-Type': 'application/json' };
  await app.request('/api/players', { method: 'POST', headers, body: '{"name":"Noa"}' });
  await app.request('/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: randomUUID(), securityId: 'TAIX', side: 'buy', amount: 100_000 }),
  });
  store.setClock(pausedAt(CLOSE));
  return { app, store };
}

describe('/tick', () => {
  it('rejects a missing or wrong secret, and changes nothing', async () => {
    const { app, store } = await withDueOrder();
    const before = await store.getPlayer('noa');
    const cursor = await store.getCursor();
    for (const authorization of [
      undefined,
      'Bearer wrong',
      'Bearer test-secre',
      'Bearer test-secret-extra',
      'test-secret',
      'Basic test-secret',
    ]) {
      const response = await tick(app, authorization);
      assert.equal(response.status, 401, String(authorization));
    }
    assert.deepEqual(await store.getPlayer('noa'), before);
    assert.equal(await store.getCursor(), cursor);
  });

  it('settles with the right secret', async () => {
    const { app, store } = await withDueOrder();
    const response = await tick(app, 'Bearer test-secret');
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { filled: number }).filled, 1);
    assert.equal((await store.getPlayer('noa'))?.pendingOrders.length, 0);
  });

  it('refuses a player token', async () => {
    const { app } = await withDueOrder();
    assert.equal((await tick(app, 'Bearer noa')).status, 401);
  });

  it('only answers POST', async () => {
    const { app } = await withDueOrder();
    const response = await app.request('/api/tick', {
      headers: { Authorization: 'Bearer test-secret' },
    });
    assert.equal(response.status, 404);
  });

  it('compares secrets of any length', () => {
    assert.equal(secretMatches('abc', 'abc'), true);
    assert.equal(secretMatches('abc', 'abcd'), false);
    assert.equal(secretMatches('', 'abc'), false);
  });
});
