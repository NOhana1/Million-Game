import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { memoryStore } from '../store/memory.ts';
import { testApp, TEST_WORLD } from '../testing.ts';

const CLOSE = Date.UTC(2026, 10, 9, 15, 30);

describe('/admin/bots', () => {
  const setup = () => {
    const store = memoryStore({ anchorWorld: TEST_WORLD, anchorReal: 1000, speed: 7, paused: false });
    const app = testApp({ store, now: () => 1000 });
    const admin = { Authorization: 'Bearer clock-secret' };
    const add = (headers: Record<string, string> = admin) =>
      app.request('/api/admin/bots', { method: 'POST', headers });
    const remove = (id: string, headers: Record<string, string> = admin) =>
      app.request(`/api/admin/bots/${id}`, { method: 'DELETE', headers });
    const close = () =>
      app.request('/api/admin/clock', {
        method: 'POST',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'advance', to: CLOSE }),
      });
    const bots = async () =>
      (await store.getShards()).flatMap((shard) => Object.values(shard.members)).filter((m) => m.bot);
    return { app, store, add, remove, close, bots };
  };

  it('refuses without the admin code', async () => {
    const { add, remove, bots } = setup();
    assert.equal((await add({ Authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await add({ Authorization: 'Bearer test-secret' })).status, 401);
    assert.equal((await remove('bot-0-0', { Authorization: 'Bearer wrong' })).status, 401);
    assert.deepEqual(await bots(), []);
  });

  it('adds a bot with its own picks, which fill and show on the table at the next market open', async () => {
    const { app, add, close, store, bots } = setup();
    await close();
    const before = (await bots()).length;

    const response = await add();
    assert.equal(response.status, 201);
    const { bot } = (await response.json()) as { bot: { id: string; name: string } };
    assert.match(bot.name, /\(bot\)$/);
    assert.equal((await bots()).length, before + 1);
    const stored = (await bots()).find((m) => m.id === bot.id);
    assert.ok(stored?.division);
    assert.ok(stored.orders.length > 0, 'it buys straight away');

    // A second one never gets the same name.
    const second = (await (await add()).json()) as { bot: { name: string } };
    assert.notEqual(second.bot.name, bot.name);

    // The next market open fills its orders, and it joins the table.
    await app.request('/api/admin/clock', {
      method: 'POST',
      headers: { Authorization: 'Bearer clock-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', to: 'next' }),
    });
    const filled = (await bots()).find((m) => m.id === bot.id);
    assert.ok(filled && Object.keys(filled.holdings).length > 0, 'it holds what it bought');
    assert.ok((await store.getTable())?.rows.some((row) => row.id === bot.id));
  });

  it('starts the league with the usual bots if it hasn’t started yet', async () => {
    const { add, bots } = setup();
    assert.equal((await add()).status, 201);
    assert.ok((await bots()).length > 1);
  });

  it('deletes a bot from the league and the table, and only bots', async () => {
    const { add, remove, close, store, bots } = setup();
    await add();
    await close();
    await close();
    const target = (await bots())[0];
    assert.ok(target);
    assert.ok((await store.getTable())?.rows.some((row) => row.id === target.id));

    assert.equal((await remove(target.id)).status, 200);
    assert.ok(!(await bots()).some((m) => m.id === target.id));
    const table = await store.getTable();
    assert.ok(table && !table.rows.some((row) => row.id === target.id));
    assert.deepEqual(table.rows.map((row) => row.rank), table.rows.map((_, i) => i + 1));

    assert.equal((await remove(target.id)).status, 404);
  });

  it('won’t delete a real player as a bot', async () => {
    const { app, remove, close, store } = setup();
    await app.request('/api/players', {
      method: 'POST',
      headers: { Authorization: 'Bearer noa', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Noa' }),
    });
    await close();
    assert.equal((await remove('noa')).status, 404);
    assert.ok((await store.getShards()).some((shard) => shard.members.noa));
  });

  it('waits while the league is updating', async () => {
    const { add, close, store } = setup();
    await close();
    await store.startSettlement({ owner: 'run', realNow: 1000, ttlMs: 60_000 });
    assert.equal((await add()).status, 409);
  });
});
