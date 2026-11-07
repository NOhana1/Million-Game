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

const setGoal = (app: TestApp, amount: unknown, token = 'noa') =>
  app.request('/api/me/goal', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });

describe('the goal', () => {
  it('needs sign-in and a player', async () => {
    const app = testApp();
    assert.equal((await app.request('/api/me/goal', { method: 'PUT' })).status, 401);
    assert.equal((await setGoal(app, 200_000_000)).status, 404);
  });

  it('is saved, shown on /me, and can be changed', async () => {
    const app = testApp();
    await post(app, 'Noa');
    assert.equal(((await (await me(app)).json()) as { goal?: number }).goal, undefined);
    assert.equal((await setGoal(app, 200_000_000)).status, 200);
    await setGoal(app, 300_000_000);
    assert.equal(((await (await me(app)).json()) as { goal: number }).goal, 300_000_000);
  });

  it('rejects anything but a sensible whole amount', async () => {
    const app = testApp();
    await post(app, 'Noa');
    for (const bad of [0, -5, 1.5, 'lots', null, 100_000_000_001]) {
      assert.equal((await setGoal(app, bad)).status, 400, String(bad));
    }
  });

  it('belongs only to the signed-in player', async () => {
    const app = testApp();
    await post(app, 'Noa');
    await post(app, 'Dana', 'dana');
    await setGoal(app, 200_000_000);
    assert.equal(((await (await me(app, 'dana')).json()) as { goal?: number }).goal, undefined);
  });
});

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

describe('the daily streak', () => {
  const visit = (app: TestApp, token = 'noa') =>
    app.request('/api/me/visit', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const DAY = 24 * 3_600_000;

  it('needs a player', async () => {
    const app = testApp();
    assert.equal((await app.request('/api/me/visit', { method: 'POST' })).status, 401);
    assert.equal((await visit(app)).status, 404);
  });

  it('counts days in a row, shows on /me, and starts again after a gap', async () => {
    let now = Date.UTC(2026, 10, 7, 9);
    const app = testApp({ now: () => now });
    await post(app, 'Noa');
    const days = async () => ((await (await visit(app)).json()) as { streak: { days: number } }).streak.days;
    assert.equal(await days(), 1);
    assert.equal(await days(), 1);
    now += DAY;
    assert.equal(await days(), 2);
    assert.deepEqual(((await (await me(app)).json()) as { streak: unknown }).streak, {
      days: 2,
      best: 2,
      lastDay: '2026-11-08',
    });
    now += 2 * DAY;
    assert.equal(await days(), 1);
  });
});
