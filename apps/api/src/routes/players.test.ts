import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { START_CASH } from '@portfolio-league/engine';

import { memoryStore } from '../store/memory.ts';
import type { Player } from '../store/types.ts';
import { pausedAt, TEST_WORLD, testApp, type TestApp } from '../testing.ts';

const newPlayerRecord = (uid: string): Player => ({
  uid,
  name: uid,
  createdAt: 0,
  cash: START_CASH,
  holdings: {},
  pendingOrders: [],
  nextDueAt: null,
  changedAt: 0,
});

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
  it('frees an email whose sign-up was abandoned, and nothing else', async () => {
    const MINUTE = 60_000;
    let now = 100 * MINUTE;
    const accounts: Record<string, { uid: string; confirmed: boolean; createdAt: number }> = {
      'old@x.com': { uid: 'old', confirmed: false, createdAt: 0 },
      'fresh@x.com': { uid: 'fresh', confirmed: false, createdAt: 99 * MINUTE },
      'sure@x.com': { uid: 'sure', confirmed: true, createdAt: 0 },
      'noa@x.com': { uid: 'noa', confirmed: false, createdAt: 0 },
    };
    const deleted: string[] = [];
    const app = testApp({
      now: () => now,
      findAccount: async (email) => accounts[email] ?? null,
      deleteAccount: async (uid) => void deleted.push(uid),
    });
    await post(app, 'Noa'); // noa joined before confirmation was required, so they play
    const release = async (email: string) =>
      (await (
        await app.request('/api/accounts/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
      ).json()) as { freed: boolean; reason: string | null };

    assert.deepEqual(await release(' OLD@x.com '), { freed: true, reason: null });
    assert.equal((await release('fresh@x.com')).reason, 'recent', 'someone may be waiting for the link');
    assert.equal((await release('sure@x.com')).reason, 'in-use');
    assert.equal((await release('noa@x.com')).reason, 'in-use', 'a player is never touched');
    assert.equal((await release('nobody@x.com')).reason, 'none');
    assert.deepEqual(deleted, ['old']);

    now += 15 * MINUTE;
    assert.equal((await release('fresh@x.com')).freed, true);
  });

  it('gives every player their own name, ignoring capitals and spaces', async () => {
    const app = testApp();
    assert.equal((await post(app, 'Noam')).status, 201);
    const taken = await post(app, '  noam ', 'dan');
    assert.equal(taken.status, 409);
    assert.equal(((await taken.json()) as { error: { code: string } }).error.code, 'NAME_TAKEN');
    assert.equal((await me(app, 'dan')).status, 404);
    assert.equal((await post(app, 'Noam12', 'dan')).status, 201);
    // Asking again as the same player is fine, and never renames or resets them.
    assert.equal((await post(app, 'Something else')).status, 200);
  });

  it('keeps bot names for the bots', async () => {
    const app = testApp();
    assert.equal((await post(app, 'Cash Keeper 3')).status, 409);
    assert.equal((await post(app, 'Noa (bot)')).status, 409);
    assert.equal((await post(app, 'Cashew')).status, 201);
  });

  it('says whether a name is free before an account exists', async () => {
    const app = testApp();
    await post(app, 'Noam');
    const ask = async (name: string) =>
      (await (await app.request(`/api/players/name?name=${encodeURIComponent(name)}`)).json()) as {
        available: boolean;
      };
    assert.equal((await ask('NOAM')).available, false);
    assert.equal((await ask('Noam2')).available, true);
    assert.equal((await ask('Index Holder 1')).available, false);
    assert.equal((await app.request('/api/players/name?name=x')).status, 422);
  });

  it('counts players who joined before names were kept', async () => {
    const store = memoryStore(pausedAt(TEST_WORLD));
    await store.createPlayer({ ...newPlayerRecord('old'), name: 'Gil' });
    const app = testApp({ store });
    assert.equal((await post(app, 'gil', 'new')).status, 409);
  });

  it('lets a player join only once their email is confirmed', async () => {
    const confirmed = new Set(['dan']);
    const app = testApp({ emailConfirmed: async (uid) => confirmed.has(uid) });
    const refused = await post(app, 'Noa');
    assert.equal(refused.status, 403);
    assert.equal(((await refused.json()) as { error: { code: string } }).error.code, 'EMAIL_NOT_CONFIRMED');
    assert.equal((await me(app)).status, 404);

    confirmed.add('noa');
    assert.equal((await post(app, 'Noa')).status, 201);
    assert.equal((await post(app, 'Dan', 'dan')).status, 201);
  });

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
