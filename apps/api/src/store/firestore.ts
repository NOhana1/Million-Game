// The real database. Everything is written by this server: firestore.rules blocks clients.

import { type Order, WORLD_START } from '@portfolio-league/engine';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';

import { type Clock, firstClock } from '../clock.ts';
import type { LeagueTable, Player, Shard, Store } from './types.ts';

const NOT_FOUND = 5; // gRPC status codes
const ALREADY_EXISTS = 6;

type Settlement = { cursor?: number; leaseOwner?: string | null; leaseUntil?: number };

export function firestoreStore(db: Firestore): Store {
  const clockDoc = db.doc('world/clock');
  const settlementDoc = db.doc('world/settlement');
  const tableDoc = db.doc('world/table');
  const shardDocs = db.collection('leagueShards');
  const weekDocs = db.collection('leagueWeeks');
  const playerDoc = (uid: string) => db.collection('players').doc(uid);
  const orderDocs = (uid: string) => playerDoc(uid).collection('orders');

  return {
    async getClock(realNow) {
      const stored = await clockDoc.get();
      if (stored.exists) return stored.data() as Clock;
      return db.runTransaction(async (tx) => {
        const current = await tx.get(clockDoc);
        if (current.exists) return current.data() as Clock;
        const clock = firstClock(realNow);
        tx.create(clockDoc, clock);
        return clock;
      });
    },

    updateClock(realNow, change) {
      return db.runTransaction(async (tx) => {
        const stored = await tx.get(clockDoc);
        const clock = change(stored.exists ? (stored.data() as Clock) : firstClock(realNow));
        tx.set(clockDoc, clock);
        return clock;
      });
    },

    async getPlayer(uid) {
      const stored = await playerDoc(uid).get();
      return stored.exists ? (stored.data() as Player) : null;
    },

    async createPlayer(player) {
      try {
        await playerDoc(player.uid).create(player);
        return { player, created: true };
      } catch (error) {
        if ((error as { code?: unknown }).code !== ALREADY_EXISTS) throw error;
        const stored = await playerDoc(player.uid).get();
        return { player: stored.data() as Player, created: false };
      }
    },

    async setGoal(uid, goal) {
      try {
        await playerDoc(uid).update({ goal });
        return true;
      } catch (error) {
        if ((error as { code?: unknown }).code !== NOT_FOUND) throw error;
        return false;
      }
    },

    async setWatchlist(uid, ids) {
      try {
        await playerDoc(uid).update({ watchlist: ids });
        return true;
      } catch (error) {
        if ((error as { code?: unknown }).code !== NOT_FOUND) throw error;
        return false;
      }
    },

    placeOrder({ uid, orderId, realNow, decide }) {
      return db.runTransaction(async (tx) => {
        const orderRef = orderDocs(uid).doc(orderId);
        const [existing, stored, storedClock] = await tx.getAll(
          orderRef,
          playerDoc(uid),
          clockDoc,
        );
        if (existing?.exists) return { order: existing.data() as Order, created: false };

        const clock = storedClock?.exists ? (storedClock.data() as Clock) : firstClock(realNow);
        if (!storedClock?.exists) tx.create(clockDoc, clock);

        const { player, order } = decide(
          stored?.exists ? (stored.data() as Player) : null,
          clock,
        );
        tx.set(playerDoc(uid), player);
        tx.create(orderRef, order);
        return { order, created: true };
      });
    },

    async listOrders(uid, { limit, after }) {
      const newestFirst = orderDocs(uid)
        .orderBy('placedAt', 'desc')
        .orderBy(FieldPath.documentId(), 'desc')
        .limit(limit);
      const page = after ? newestFirst.startAfter(after.placedAt, after.id) : newestFirst;
      return (await page.get()).docs.map((doc) => doc.data() as Order);
    },

    async getCursor() {
      const stored = (await settlementDoc.get()).data() as Settlement | undefined;
      return stored?.cursor ?? WORLD_START;
    },

    startSettlement({ owner, realNow, ttlMs }) {
      return db.runTransaction(async (tx) => {
        const stored = (await tx.get(settlementDoc)).data() as Settlement | undefined;
        if (stored?.leaseOwner && (stored.leaseUntil ?? 0) > realNow) return null;
        const cursor = stored?.cursor ?? WORLD_START;
        tx.set(settlementDoc, { cursor, leaseOwner: owner, leaseUntil: realNow + ttlMs });
        return cursor;
      });
    },

    saveSlot(owner, next, save) {
      return db.runTransaction(async (tx) => {
        const stored = (await tx.get(settlementDoc)).data() as Settlement | undefined;
        if (stored?.leaseOwner !== owner) return false;
        tx.update(settlementDoc, { cursor: Math.max(stored.cursor ?? WORLD_START, next) });
        for (const shard of save.shards) tx.set(shardDocs.doc(shard.id), shard);
        if (save.table) tx.set(tableDoc, save.table);
        if (save.finishedWeek) {
          tx.set(weekDocs.doc(String(save.finishedWeek.weekEndsAt)), save.finishedWeek);
        }
        return true;
      });
    },

    async endSettlement(owner) {
      await db.runTransaction(async (tx) => {
        const stored = (await tx.get(settlementDoc)).data() as Settlement | undefined;
        if (stored?.leaseOwner === owner) tx.update(settlementDoc, { leaseOwner: null });
      });
    },

    async getShards() {
      return (await shardDocs.get()).docs.map((doc) => doc.data() as Shard);
    },

    async getTable() {
      return ((await tableDoc.get()).data() as LeagueTable | undefined) ?? null;
    },

    async getFinishedWeek(endsAt) {
      const stored = await weekDocs.doc(String(endsAt)).get();
      return (stored.data() as LeagueTable | undefined) ?? null;
    },

    async listFinishedWeeks() {
      return (await weekDocs.get()).docs.map((doc) => doc.data() as LeagueTable);
    },

    async playersChangedSince(since) {
      const changed = await db.collection('players').where('changedAt', '>=', since).get();
      return changed.docs.map((doc) => doc.data() as Player);
    },

    async duePlayers(upTo, limit) {
      const due = await db
        .collection('players')
        .where('nextDueAt', '<=', upTo)
        .limit(limit)
        .select()
        .get();
      return due.docs.map((doc) => doc.id);
    },

    settlePlayer(uid, settle) {
      return db.runTransaction(async (tx) => {
        const stored = await tx.get(playerDoc(uid));
        if (!stored.exists) return 0;
        const { player, filled } = settle(stored.data() as Player);
        tx.set(playerDoc(uid), player);
        for (const order of filled) tx.set(orderDocs(uid).doc(order.id), order);
        return filled.length;
      });
    },
  };
}
