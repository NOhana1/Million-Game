// Every store must behave the same way. This suite always runs on the in-memory store, and
// runs on Firestore too when the emulator is on (FIRESTORE_EMULATOR_HOST is set).

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { newAccount, type Order } from '@portfolio-league/engine';

import { ApiError } from '../errors.ts';
import { memoryStore } from './memory.ts';
import type { Decision, Player, Store } from './types.ts';

const player = (uid: string): Player => {
  const { cash, holdings } = newAccount();
  return { uid, name: 'Noa', createdAt: 1, cash, holdings, pendingOrders: [] };
};

const order = (id: string, placedAt = 5): Order => ({
  id,
  securityId: 'TAIX',
  side: 'buy',
  amount: 100,
  placedAt,
  execution: { kind: 'close', at: 10 },
  status: 'pending',
});

const buy = (id: string, placedAt?: number) => (current: Player | null): Decision => {
  if (!current) throw new ApiError(404, 'PLAYER_NOT_FOUND', 'No player.');
  const placed = order(id, placedAt);
  return {
    order: placed,
    player: {
      ...current,
      cash: current.cash - placed.amount,
      pendingOrders: [...current.pendingOrders, placed],
    },
  };
};

function storeContract(name: string, makeStore: () => Store) {
  describe(`${name} store`, () => {
    const store = makeStore();
    const newUid = () => randomUUID();

    it('starts the clock once', async () => {
      const first = await store.getClock(100);
      assert.deepEqual(await store.getClock(900), first);
    });

    it('finds nothing for an unknown player', async () => {
      assert.equal(await store.getPlayer(newUid()), null);
    });

    it('creates a player once, and keeps the first one', async () => {
      const uid = newUid();
      assert.equal((await store.createPlayer(player(uid))).created, true);
      const again = await store.createPlayer({ ...player(uid), name: 'Other' });
      assert.equal(again.created, false);
      assert.equal(again.player.name, 'Noa');
    });

    it('saves the player and the order together', async () => {
      const uid = newUid();
      await store.createPlayer(player(uid));
      const id = randomUUID();
      const result = await store.placeOrder({ uid, orderId: id, realNow: 0, decide: buy(id) });
      assert.equal(result.created, true);
      const saved = await store.getPlayer(uid);
      assert.equal(saved?.pendingOrders.length, 1);
      assert.equal((await store.listOrders(uid, { limit: 10 })).length, 1);
    });

    it('returns the original order on a repeat, and changes nothing', async () => {
      const uid = newUid();
      await store.createPlayer(player(uid));
      const id = randomUUID();
      await store.placeOrder({ uid, orderId: id, realNow: 0, decide: buy(id) });
      const cash = (await store.getPlayer(uid))?.cash;
      const repeat = await store.placeOrder({ uid, orderId: id, realNow: 0, decide: buy(id) });
      assert.equal(repeat.created, false);
      assert.equal((await store.getPlayer(uid))?.cash, cash);
    });

    it('never loses a charge when orders arrive together', async () => {
      const uid = newUid();
      await store.createPlayer(player(uid));
      const start = (await store.getPlayer(uid))?.cash ?? 0;
      await Promise.all(
        Array.from({ length: 5 }, () => {
          const id = randomUUID();
          return store.placeOrder({ uid, orderId: id, realNow: 0, decide: buy(id) });
        }),
      );
      const saved = await store.getPlayer(uid);
      assert.equal(saved?.cash, start - 500);
      assert.equal(saved?.pendingOrders.length, 5);
    });

    it('saves nothing when the decision refuses', async () => {
      const uid = newUid();
      const id = randomUUID();
      await assert.rejects(
        store.placeOrder({ uid, orderId: id, realNow: 0, decide: buy(id) }),
        ApiError,
      );
      assert.deepEqual(await store.listOrders(uid, { limit: 10 }), []);
    });

    it('pages newest first, past identical times', async () => {
      const uid = newUid();
      await store.createPlayer(player(uid));
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      for (const id of ids) {
        await store.placeOrder({ uid, orderId: id, realNow: 0, decide: buy(id, 7) });
      }
      const first = await store.listOrders(uid, { limit: 2 });
      const last = first.at(-1) as Order;
      const rest = await store.listOrders(uid, {
        limit: 2,
        after: { placedAt: last.placedAt, id: last.id },
      });
      assert.equal(first.length, 2);
      assert.equal(rest.length, 1);
      assert.deepEqual([...first, ...rest].map((o) => o.id).sort(), [...ids].sort());
    });
  });
}

storeContract('memory', memoryStore);

if (process.env.FIRESTORE_EMULATOR_HOST) {
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { firestoreStore } = await import('./firestore.ts');
  const app = initializeApp({ projectId: 'demo-portfolio-league' }, 'contract-test');
  storeContract('firestore', () => firestoreStore(getFirestore(app)));
}
