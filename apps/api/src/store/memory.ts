// A store that forgets everything on restart. For tests and local runs only.

import type { Order } from '@portfolio-league/engine';

import { type Clock, firstClock } from '../clock.ts';
import type { Player, Store } from './types.ts';

export function memoryStore(startClock?: Clock): Store {
  const players = new Map<string, Player>();
  const orders = new Map<string, Map<string, Order>>();
  let clock = startClock;

  return {
    async getClock(realNow) {
      clock ??= firstClock(realNow);
      return { ...clock };
    },

    async getPlayer(uid) {
      return structuredClone(players.get(uid) ?? null);
    },

    async createPlayer(player) {
      const existing = players.get(player.uid);
      if (existing) return { player: structuredClone(existing), created: false };
      players.set(player.uid, structuredClone(player));
      return { player, created: true };
    },

    async placeOrder({ uid, orderId, realNow, decide }) {
      clock ??= firstClock(realNow);
      const history = orders.get(uid) ?? new Map<string, Order>();
      const existing = history.get(orderId);
      if (existing) return { order: structuredClone(existing), created: false };

      const { player, order } = decide(structuredClone(players.get(uid) ?? null), { ...clock });
      players.set(uid, structuredClone(player));
      orders.set(uid, history.set(orderId, structuredClone(order)));
      return { order, created: true };
    },

    async listOrders(uid, { limit, after }) {
      const newestFirst = (a: Order, b: Order) =>
        b.placedAt - a.placedAt || b.id.localeCompare(a.id);
      const all = [...(orders.get(uid)?.values() ?? [])].sort(newestFirst);
      const found = after ? all.findIndex((o) => newestFirst(o, { ...o, ...after }) > 0) : 0;
      const start = found < 0 ? all.length : found;
      return structuredClone(all.slice(start, start + limit));
    },
  };
}
