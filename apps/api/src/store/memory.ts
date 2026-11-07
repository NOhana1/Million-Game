// A store that forgets everything on restart. For tests and local runs only.

import { type Order, WORLD_START } from '@portfolio-league/engine';

import { type Clock, firstClock } from '../clock.ts';
import {
  createProblem,
  joinProblem,
  removeProblem,
  withMember,
  withMessage,
  withoutMember,
} from './group-rules.ts';
import type { ChatMessage, Group, LeagueTable, Player, Shard, Store } from './types.ts';

export type MemoryStore = Store & { setClock(next: Clock): void };

export function memoryStore(startClock?: Clock): MemoryStore {
  const players = new Map<string, Player>();
  const orders = new Map<string, Map<string, Order>>();
  let clock = startClock;
  let cursor = WORLD_START;
  let lease: { owner: string; until: number } | null = null;
  let shards: Shard[] = [];
  let table: LeagueTable | null = null;
  const finishedWeeks = new Map<number, LeagueTable>();
  const groups = new Map<string, Group>();
  const chats = new Map<string, ChatMessage[]>();
  const photos = new Map<string, string>();

  return {
    setClock(next) {
      clock = next;
    },

    async getClock(realNow) {
      clock ??= firstClock(realNow);
      return { ...clock };
    },

    async updateClock(realNow, change) {
      clock = change(clock ?? firstClock(realNow));
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

    async setGoal(uid, goal) {
      const stored = players.get(uid);
      if (!stored) return false;
      stored.goal = goal;
      return true;
    },

    async setWatchlist(uid, ids) {
      const stored = players.get(uid);
      if (!stored) return false;
      stored.watchlist = [...ids];
      return true;
    },

    async setPhoto(uid, photo) {
      if (!players.has(uid)) return false;
      if (photo) photos.set(uid, photo);
      else photos.delete(uid);
      return true;
    },

    async getPhotos(uids) {
      return Object.fromEntries(
        uids.flatMap((uid) => {
          const photo = photos.get(uid);
          return photo ? [[uid, photo]] : [];
        }),
      );
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

    async createGroup(group) {
      const player = players.get(group.ownerId) ?? null;
      const problem = createProblem(player);
      if (problem || !player) return problem ?? { problem: 'NO_PLAYER' };
      player.groupId = group.id;
      groups.set(group.id, structuredClone(group));
      return { group: structuredClone(group) };
    },

    async joinGroup(uid, code, joinedAt) {
      const player = players.get(uid) ?? null;
      const group = [...groups.values()].find((g) => g.code === code) ?? null;
      const problem = joinProblem(player, group);
      if (problem || !player || !group) return problem ?? { problem: 'NO_GROUP' };
      const next = withMember(group, player, joinedAt);
      groups.set(group.id, next);
      player.groupId = group.id;
      return { group: structuredClone(next) };
    },

    async leaveGroup(uid) {
      const player = players.get(uid);
      if (!player) return { problem: 'NO_PLAYER' };
      const group = player.groupId ? groups.get(player.groupId) : undefined;
      if (!group) return { problem: 'NO_GROUP' };
      const next = withoutMember(group, uid);
      delete player.groupId;
      if (next) {
        groups.set(group.id, next);
      } else {
        groups.delete(group.id);
        chats.delete(group.id);
      }
      return { group: structuredClone(next) };
    },

    async removeMember(ownerId, memberId) {
      const groupId = players.get(ownerId)?.groupId;
      const group = groupId ? (groups.get(groupId) ?? null) : null;
      const problem = removeProblem(group, ownerId, memberId);
      if (problem || !group) return problem ?? { problem: 'NO_GROUP' };
      const next = withoutMember(group, memberId);
      if (next) groups.set(group.id, next);
      delete players.get(memberId)?.groupId;
      return { group: structuredClone(next) };
    },

    async getGroup(id) {
      return structuredClone(groups.get(id) ?? null);
    },

    async findGroupByCode(code) {
      return structuredClone([...groups.values()].find((g) => g.code === code) ?? null);
    },

    async addMessage(uid, message) {
      const player = players.get(uid);
      if (!player) return { problem: 'NO_PLAYER' };
      const groupId = player.groupId;
      if (!groupId) return { problem: 'NO_GROUP' };
      const result = withMessage(chats.get(groupId) ?? [], player, message);
      if (!Array.isArray(result)) return result;
      chats.set(groupId, result);
      return { group: null };
    },

    async getMessages(groupId) {
      return structuredClone(chats.get(groupId) ?? []);
    },

    async getCursor() {
      return cursor;
    },

    async startSettlement({ owner, realNow, ttlMs }) {
      if (lease && lease.until > realNow) return null;
      lease = { owner, until: realNow + ttlMs };
      return cursor;
    },

    async saveSlot(owner, next, save) {
      if (lease?.owner !== owner) return false;
      cursor = Math.max(cursor, next);
      if (save.shards.length) shards = structuredClone(save.shards);
      if (save.table) table = structuredClone(save.table);
      if (save.finishedWeek) {
        finishedWeeks.set(save.finishedWeek.weekEndsAt, structuredClone(save.finishedWeek));
      }
      return true;
    },

    async endSettlement(owner) {
      if (lease?.owner === owner) lease = null;
    },

    async getShards() {
      return structuredClone(shards);
    },

    async getTable() {
      return structuredClone(table);
    },

    async getFinishedWeek(endsAt) {
      return structuredClone(finishedWeeks.get(endsAt) ?? null);
    },

    async listFinishedWeeks() {
      return structuredClone([...finishedWeeks.values()]);
    },

    async playersChangedSince(since) {
      return structuredClone([...players.values()].filter((p) => p.changedAt >= since));
    },

    async duePlayers(upTo, limit) {
      return [...players.values()]
        .filter((player) => player.nextDueAt !== null && player.nextDueAt <= upTo)
        .slice(0, limit)
        .map((player) => player.uid);
    },

    async settlePlayer(uid, settle) {
      const stored = players.get(uid);
      if (!stored) return 0;
      const { player, filled } = settle(structuredClone(stored));
      players.set(uid, structuredClone(player));
      for (const order of filled) orders.get(uid)?.set(order.id, structuredClone(order));
      return filled.length;
    },
  };
}
