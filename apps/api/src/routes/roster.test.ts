import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { memoryStore } from '../store/memory.ts';
import { testApp, TEST_WORLD } from '../testing.ts';
import type { RosterRow } from './roster.ts';

const CLOSE = Date.UTC(2026, 10, 9, 15, 30);

describe('/admin/players', () => {
  const setup = () => {
    const store = memoryStore({ anchorWorld: TEST_WORLD, anchorReal: 1000, speed: 7, paused: false });
    const app = testApp({ store, now: () => 1000 });
    const roster = (secret = 'clock-secret') =>
      app.request('/api/admin/players', { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
    const join = async (uid: string, name: string) => {
      const headers = { Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json' };
      await app.request('/api/players', { method: 'POST', headers, body: JSON.stringify({ name }) });
      return headers;
    };
    return { app, store, roster, join };
  };

  it('refuses without the admin code, and the alarm secret does not open it', async () => {
    const { roster } = setup();
    assert.equal((await roster('wrong')).status, 401);
    assert.equal((await roster('test-secret')).status, 401);
  });

  it('lists real players apart from the bots, without emails', async () => {
    const { app, roster, join } = setup();
    const headers = await join('noa', 'Noa');
    await join('dan', 'Dan');
    await app.request('/api/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: randomUUID(), securityId: 'TAIX', side: 'buy', amount: 100_000 }),
    });
    // Moving the clock fills Noa's order and brings in the bots.
    await app.request('/api/admin/clock', {
      method: 'POST',
      headers: { Authorization: 'Bearer clock-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', to: CLOSE }),
    });

    const response = await roster();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const body = (await response.json()) as { players: RosterRow[]; bots: RosterRow[] };

    assert.deepEqual(body.players.map((p) => p.name).sort(), ['Dan', 'Noa']);
    assert.ok(body.bots.length > 0);
    assert.ok(body.bots.every((bot) => !body.players.some((p) => p.id === bot.id)));
    assert.doesNotMatch(JSON.stringify(body), /@|email/i);
  });

  it('only reads', async () => {
    const { store, roster, join } = setup();
    await join('noa', 'Noa');
    const before = JSON.stringify([await store.playersChangedSince(0), await store.getClock(0)]);
    await roster();
    assert.equal(JSON.stringify([await store.playersChangedSince(0), await store.getClock(0)]), before);
  });
});

describe('DELETE /admin/players/:id', () => {
  const setup = () => {
    const store = memoryStore({ anchorWorld: TEST_WORLD, anchorReal: 1000, speed: 7, paused: false });
    const deleted: string[] = [];
    const app = testApp({ store, now: () => 1000, deleteAccount: async (uid) => void deleted.push(uid) });
    const as = (uid: string) => ({ Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json' });
    const admin = { Authorization: 'Bearer clock-secret', 'Content-Type': 'application/json' };
    const remove = (uid: string, headers: Record<string, string> = admin) =>
      app.request(`/api/admin/players/${uid}`, { method: 'DELETE', headers });
    const join = (uid: string, name: string) =>
      app.request('/api/players', { method: 'POST', headers: as(uid), body: JSON.stringify({ name }) });
    const close = () =>
      app.request('/api/admin/clock', {
        method: 'POST',
        headers: admin,
        body: JSON.stringify({ action: 'advance', to: CLOSE }),
      });
    return { app, store, deleted, as, remove, join, close };
  };

  it('refuses without the admin code, and deletes nothing', async () => {
    const { store, deleted, remove, join } = setup();
    await join('noa', 'Noa');
    assert.equal((await remove('noa', { Authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await remove('noa', { Authorization: 'Bearer noa' })).status, 401);
    assert.ok(await store.getPlayer('noa'));
    assert.deepEqual(deleted, []);
  });

  it('removes the player everywhere and their sign-in, so the same account can join again', async () => {
    const { app, store, deleted, as, remove, join, close } = setup();
    await join('noa', 'Noa');
    await join('dan', 'Dan');
    await app.request('/api/groups', { method: 'POST', headers: as('noa'), body: JSON.stringify({ name: 'Bulls' }) });
    const { group } = (await (await app.request('/api/group', { headers: as('noa') })).json()) as {
      group: { code: string };
    };
    await app.request('/api/groups/join', { method: 'POST', headers: as('dan'), body: JSON.stringify({ code: group.code }) });
    await app.request('/api/orders', {
      method: 'POST',
      headers: as('noa'),
      body: JSON.stringify({ id: randomUUID(), securityId: 'TAIX', side: 'buy', amount: 100_000 }),
    });
    await close();
    assert.ok((await store.getTable())?.rows.some((row) => row.id === 'noa'));

    const response = await remove('noa');
    assert.equal(response.status, 200);
    // Past weeks still list Noa, but their page is gone.
    assert.equal((await app.request('/api/players/noa/profile')).status, 404);
    assert.deepEqual(deleted, ['noa']);
    assert.equal(await store.getPlayer('noa'), null);
    assert.deepEqual(await store.listOrders('noa', { limit: 10 }), []);
    const members = (await store.getShards()).flatMap((shard) => Object.keys(shard.members));
    assert.ok(!members.includes('noa'));
    const table = await store.getTable();
    assert.ok(table && !table.rows.some((row) => row.id === 'noa'));
    assert.deepEqual(table.rows.map((row) => row.rank), table.rows.map((_, i) => i + 1));
    // Dan keeps the group and now owns it.
    const dan = await store.getPlayer('dan');
    const kept = await store.getGroup(dan?.groupId ?? '');
    assert.deepEqual(kept?.members.map((m) => m.id), ['dan']);
    assert.equal(kept?.ownerId, 'dan');

    // Signing up again starts a fresh player.
    assert.equal((await join('noa', 'Noa again')).status, 201);
    const fresh = await store.getPlayer('noa');
    assert.equal(fresh?.name, 'Noa again');
    assert.deepEqual(fresh?.pendingOrders, []);
    assert.equal(fresh?.groupId, undefined);
  });

  it('frees the deleted player’s name for someone else', async () => {
    const { remove, join } = setup();
    assert.equal((await join('noa', 'Noa')).status, 201);
    assert.notEqual((await join('dan', 'noa')).status, 201, 'taken while Noa plays');
    assert.equal((await remove('noa')).status, 200);
    assert.equal((await join('dan', 'Noa')).status, 201);
  });

  it('lets the same person sign up again with the same name after being deleted', async () => {
    const { app, remove, join } = setup();
    const free = async (name: string) =>
      ((await (await app.request(`/api/players/name?name=${name}`)).json()) as { available: boolean }).available;
    assert.equal((await join('noa', 'Noam')).status, 201);
    assert.equal(await free('noam'), false);
    assert.equal((await join('dan', 'NOAM')).status, 409, 'nobody else gets the name');
    assert.equal((await remove('noa')).status, 200);
    assert.equal(await free('noam'), true);
    // On the live game a new sign-up gets a new account id; here it's a new token.
    assert.equal((await join('noa-again', 'Noam')).status, 201);
    assert.equal((await join('dan', 'Noam')).status, 409, 'taken again by the new player');
  });

  it('can be repeated, and won’t delete a bot', async () => {
    const { store, remove, join, close } = setup();
    await join('noa', 'Noa');
    await close();
    assert.equal((await remove('noa')).status, 200);
    assert.equal((await remove('noa')).status, 200);
    const bot = (await store.getShards()).flatMap((s) => Object.values(s.members)).find((m) => m.bot);
    assert.ok(bot);
    assert.equal((await remove(bot.id)).status, 400);
    assert.ok((await store.getShards()).some((s) => s.members[bot.id]));
  });

  it('waits while the league is updating', async () => {
    const { store, remove, join } = setup();
    await join('noa', 'Noa');
    await store.startSettlement({ owner: 'run', realNow: 1000, ttlMs: 60_000 });
    const response = await remove('noa');
    assert.equal(response.status, 409);
    assert.ok(await store.getPlayer('noa'));
    await store.endSettlement('run');
    assert.equal((await remove('noa')).status, 200);
  });
});
