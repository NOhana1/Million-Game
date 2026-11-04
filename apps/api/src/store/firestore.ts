// The real database. Everything is written by this server: firestore.rules blocks clients.

import type { Order } from '@portfolio-league/engine';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';

import { type Clock, firstClock } from '../clock.ts';
import type { Player, Store } from './types.ts';

const ALREADY_EXISTS = 6; // gRPC status code

export function firestoreStore(db: Firestore): Store {
  const clockDoc = db.doc('world/clock');
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
  };
}
