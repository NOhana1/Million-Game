// Every store must behave the same way. This suite always runs on the in-memory store, and
// runs on Firestore too when the emulator is on (FIRESTORE_EMULATOR_HOST is set).

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { newAccount, type Order } from '@portfolio-league/engine';

import { ApiError } from '../errors.ts';
import { withPending } from '../player.ts';
import { memoryStore } from './memory.ts';
import type { Decision, Player, Store } from './types.ts';

const player = (uid: string): Player => {
  const { cash, holdings } = newAccount();
  return { uid, name: 'Noa', createdAt: 1, cash, holdings, pendingOrders: [], nextDueAt: null, changedAt: 3 };
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
    player: withPending({ ...current, cash: current.cash - placed.amount }, [
      ...current.pendingOrders,
      placed,
    ]),
  };
};

const NOTHING = { shards: [], table: null };

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

    it('finds players by due time, and only those', async () => {
      const uid = newUid();
      await store.createPlayer(player(uid));
      const id = randomUUID();
      await store.placeOrder({ uid, orderId: id, realNow: 0, decide: buy(id) });
      assert.ok((await store.duePlayers(10, 1000)).includes(uid));
      assert.ok(!(await store.duePlayers(9, 1000)).includes(uid));
    });

    it('fills an order once when two runs settle at the same moment', async () => {
      const uid = newUid();
      await store.createPlayer(player(uid));
      const id = randomUUID();
      await store.placeOrder({ uid, orderId: id, realNow: 0, decide: buy(id) });
      const start = (await store.getPlayer(uid))?.cash ?? 0;
      const settle = (current: Player) => {
        const filled = current.pendingOrders.map((o) => ({ ...o, status: 'filled' as const }));
        return {
          filled,
          player: withPending({ ...current, cash: current.cash + 1000 * filled.length }, []),
        };
      };
      const counts = await Promise.all([store.settlePlayer(uid, settle), store.settlePlayer(uid, settle)]);
      assert.deepEqual(counts.sort(), [0, 1]);
      const saved = await store.getPlayer(uid);
      assert.equal(saved?.cash, start + 1000);
      assert.equal(saved?.nextDueAt, null);
      assert.equal((await store.listOrders(uid, { limit: 10 }))[0]?.status, 'filled');
    });
  });

  describe(`${name} store settlement`, () => {
    const lease = (owner: string, realNow = 1000) => ({ owner, realNow, ttlMs: 60_000 });

    it('lets one run in, then the next once it ends', async () => {
      const store = makeStore();
      const a = randomUUID();
      const b = randomUUID();
      assert.notEqual(await store.startSettlement(lease(a)), null);
      assert.equal(await store.startSettlement(lease(b)), null);
      await store.endSettlement(a);
      assert.notEqual(await store.startSettlement(lease(b)), null);
      await store.endSettlement(b);
    });

    it('frees a lease that expired, and the old run can no longer save', async () => {
      const store = makeStore();
      const crashed = randomUUID();
      const next = randomUUID();
      const start = (await store.startSettlement(lease(crashed))) ?? 0;
      assert.notEqual(await store.startSettlement(lease(next, 1_000_000_000_000_000)), null);
      assert.equal(await store.saveSlot(crashed, start + 1, NOTHING), false);
      await store.endSettlement(crashed);
      assert.equal(await store.saveSlot(next, start + 2, NOTHING), true);
      assert.equal(await store.getCursor(), start + 2);
      await store.endSettlement(next);
    });

    it('saves the league with the cursor, or not at all', async () => {
      const store = makeStore();
      const owner = randomUUID();
      const start = (await store.startSettlement(lease(owner, 3_000_000_000_000_000))) ?? 0;
      const table = { updatedAt: 1, weekEndsAt: start, previousWeekEndsAt: null, total: 0, rows: [] };
      const shard = { id: 'contract-test', members: {} };
      assert.equal(await store.saveSlot('someone-else', start + 1, { shards: [shard], table }), false);
      assert.ok(!(await store.getShards()).some((s) => s.id === 'contract-test'));

      assert.equal(
        await store.saveSlot(owner, start + 1, { shards: [shard], table, finishedWeek: table }),
        true,
      );
      assert.ok((await store.getShards()).some((s) => s.id === 'contract-test'));
      assert.deepEqual(await store.getTable(), table);
      assert.deepEqual(await store.getFinishedWeek(start), table);
      await store.endSettlement(owner);
    });

    it('finds players who changed', async () => {
      const store = makeStore();
      const uid = randomUUID();
      await store.createPlayer(player(uid));
      const found = async (since: number) =>
        (await store.playersChangedSince(since)).some((p) => p.uid === uid);
      assert.equal(await found(3), true);
      assert.equal(await found(4), false);
    });

    it('never moves the cursor backwards', async () => {
      const store = makeStore();
      const owner = randomUUID();
      const start = (await store.startSettlement(lease(owner, 2_000_000_000_000_000))) ?? 0;
      await store.saveSlot(owner, start + 10, NOTHING);
      await store.saveSlot(owner, start + 5, NOTHING);
      assert.equal(await store.getCursor(), start + 10);
      await store.endSettlement(owner);
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
