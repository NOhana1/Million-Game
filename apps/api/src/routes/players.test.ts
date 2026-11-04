import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { START_CASH } from '@portfolio-league/engine';

import { testApp, type TestApp } from '../testing.ts';

const post = (app: TestApp, name: unknown, token = 'noa') =>
  app.request('/api/players', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

const me = (app: TestApp, token = 'noa') =>
  app.request('/api/me', { headers: { Authorization: `Bearer ${token}` } });

describe('players', () => {
  it('rejects a missing or invalid token', async () => {
    const app = testApp();
    assert.equal((await app.request('/api/me')).status, 401);
    assert.equal((await me(app, 'invalid')).status, 401);
    const noScheme = await app.request('/api/me', { headers: { Authorization: 'noa' } });
    assert.equal(noScheme.status, 401);
  });

  it('starts a new player with one million shekels and nothing else', async () => {
    const app = testApp();
    const response = await post(app, '  Noa  ');
    assert.equal(response.status, 201);
    const player = (await response.json()) as Record<string, unknown>;
    assert.equal(player.uid, 'noa');
    assert.equal(player.name, 'Noa');
    assert.equal(player.cash, START_CASH);
    assert.deepEqual(player.holdings, {});
    assert.deepEqual(player.pendingOrders, []);
  });

  it('never resets a player who signs up twice', async () => {
    const app = testApp();
    await post(app, 'Noa');
    const again = await post(app, 'Someone else');
    assert.equal(again.status, 200);
    assert.equal(((await again.json()) as { name: string }).name, 'Noa');
  });

  it('takes the player id from the token, never from the body', async () => {
    const app = testApp();
    const response = await app.request('/api/players', {
      method: 'POST',
      headers: { Authorization: 'Bearer noa', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Noa', uid: 'dana', cash: 999 }),
    });
    const player = (await response.json()) as { uid: string; cash: number };
    assert.equal(player.uid, 'noa');
    assert.equal(player.cash, START_CASH);
  });

  it('rejects bad names', async () => {
    const app = testApp();
    for (const name of ['', ' a ', 'x'.repeat(25), 'a\nb', 42, undefined]) {
      assert.equal((await post(app, name)).status, 400, `name: ${String(name)}`);
    }
  });

  it('rejects a body that is not JSON', async () => {
    const app = testApp();
    const response = await app.request('/api/players', {
      method: 'POST',
      headers: { Authorization: 'Bearer noa' },
      body: 'not json',
    });
    assert.equal(response.status, 400);
  });

  it('accepts a Hebrew name', async () => {
    assert.equal((await post(testApp(), 'נועם')).status, 201);
  });

  it('shows a player only their own data', async () => {
    const app = testApp();
    await post(app, 'Noa');
    assert.equal((await me(app)).status, 200);
    assert.equal((await me(app, 'dana')).status, 404);
  });
});
