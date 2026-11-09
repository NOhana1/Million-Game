import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { memoryStore } from '../store/memory.ts';
import { testApp, TEST_WORLD } from '../testing.ts';
import type { RealPlayer, RosterRow } from './roster.ts';

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

  it('refuses without the clock code, and the alarm secret does not open it', async () => {
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
    const body = (await response.json()) as { players: RealPlayer[]; bots: RosterRow[] };

    assert.deepEqual(body.players.map((p) => p.name).sort(), ['Dan', 'Noa']);
    const noa = body.players.find((p) => p.name === 'Noa')!;
    assert.equal(noa.holdings, 1);
    assert.equal(noa.pendingOrders, 0);
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
