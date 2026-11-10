import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { memoryStore } from '../store/memory.ts';
import { testApp, TEST_WORLD } from '../testing.ts';

const CLOSE = Date.UTC(2026, 10, 9, 15, 30);

describe('PUT /me/name', () => {
  const setup = () => {
    const store = memoryStore({ anchorWorld: TEST_WORLD, anchorReal: 1000, speed: 7, paused: false });
    const app = testApp({ store, now: () => 1000 });
    const as = (uid: string) => ({ Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json' });
    const join = (uid: string, name: string) =>
      app.request('/api/players', { method: 'POST', headers: as(uid), body: JSON.stringify({ name }) });
    const rename = (uid: string, name: unknown) =>
      app.request('/api/me/name', { method: 'PUT', headers: as(uid), body: JSON.stringify({ name }) });
    const advance = (to: number | 'next') =>
      app.request('/api/admin/clock', {
        method: 'POST',
        headers: { Authorization: 'Bearer clock-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'advance', to }),
      });
    return { app, store, as, join, rename, advance };
  };

  it('needs sign-in, a player and a proper name', async () => {
    const { app, join, rename } = setup();
    const response = await app.request('/api/me/name', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Noa' }),
    });
    assert.equal(response.status, 401);
    assert.equal((await rename('noa', 'Noa')).status, 404);
    await join('noa', 'Noa');
    assert.equal((await rename('noa', 'N')).status, 400);
    assert.equal((await rename('noa', 'Cash Keeper 9 (bot)')).status, 409);
  });

  it('takes the new name, frees the old one, and refuses someone else’s', async () => {
    const { store, join, rename } = setup();
    await join('noa', 'Noa');
    await join('dan', 'Dan');
    assert.equal((await rename('noa', 'dan')).status, 409);

    const response = await rename('noa', '  Noa the Bull ');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { name: 'Noa the Bull' });
    assert.equal((await store.getPlayer('noa'))?.name, 'Noa the Bull');
    assert.equal(await store.nameOwner('noa the bull'), 'noa');
    assert.equal(await store.nameOwner('noa'), null);
    // The old name is free for someone else.
    assert.equal((await join('lia', 'Noa')).status, 201);
  });

  it('allows changing only the capitals of your own name', async () => {
    const { store, join, rename } = setup();
    await join('noa', 'noa');
    assert.equal((await rename('noa', 'NOA')).status, 200);
    assert.equal((await store.getPlayer('noa'))?.name, 'NOA');
    assert.equal(await store.nameOwner('noa'), 'noa');
  });

  it('shows in the group and on the table at once, and in the league after the next open or close', async () => {
    const { app, store, as, join, rename, advance } = setup();
    await join('noa', 'Noa');
    await app.request('/api/groups', { method: 'POST', headers: as('noa'), body: JSON.stringify({ name: 'Bulls' }) });
    await app.request('/api/orders', {
      method: 'POST',
      headers: as('noa'),
      body: JSON.stringify({ id: randomUUID(), securityId: 'TAIX', side: 'buy', amount: 100_000 }),
    });
    await advance(CLOSE);
    assert.ok((await store.getTable())?.rows.some((row) => row.name === 'Noa'));

    await rename('noa', 'Noa Two');
    const groupId = (await store.getPlayer('noa'))?.groupId ?? '';
    assert.equal((await store.getGroup(groupId))?.members[0]?.name, 'Noa Two');
    assert.ok((await store.getTable())?.rows.some((row) => row.id === 'noa' && row.name === 'Noa Two'));

    await advance('next');
    const member = (await store.getShards()).flatMap((s) => Object.values(s.members)).find((m) => m.id === 'noa');
    assert.equal(member?.name, 'Noa Two');
    assert.ok((await store.getTable())?.rows.some((row) => row.id === 'noa' && row.name === 'Noa Two'));
  });
});
