// The real database. Everything is written by this server: firestore.rules blocks clients.

import { type Order, WORLD_START } from '@portfolio-league/engine';
import { FieldPath, FieldValue, type Firestore } from 'firebase-admin/firestore';

import { type Clock, firstClock } from '../clock.ts';
import { nextStreak } from '../services/streak.ts';
import {
  createProblem,
  joinProblem,
  ownerProblem,
  removeProblem,
  withMember,
  withMessage,
  withoutMember,
} from './group-rules.ts';
import { nameKey, renamedMember, renamedRow } from './player-names.ts';
import { shardsWithout, tableWithout } from './player-removal.ts';
import type { ChatMessage, Group, LeagueTable, Player, SavedPhoto, Shard, Store } from './types.ts';

const NOT_FOUND = 5; // gRPC status codes
const ALREADY_EXISTS = 6;

type Chat = { messages: ChatMessage[] };

type Settlement = { cursor?: number; leaseOwner?: string | null; leaseUntil?: number };

export function firestoreStore(db: Firestore): Store {
  const clockDoc = db.doc('world/clock');
  const settlementDoc = db.doc('world/settlement');
  const tableDoc = db.doc('world/table');
  const shardDocs = db.collection('leagueShards');
  const weekDocs = db.collection('leagueWeeks');
  const playerDoc = (uid: string) => db.collection('players').doc(uid);
  // One document per taken name, so two sign-ups can't take the same name at once. The id is
  // encoded, since a name may hold a slash.
  const nameDoc = (key: string) => db.collection('playerNames').doc(`n_${encodeURIComponent(key)}`);
  const namesReadyDoc = db.doc('world/playerNames');
  let namesReady = false;

  // Players who joined before names were kept get their names written down once, earliest first,
  // so a newcomer can't take an existing player's name. Safe to run twice: it only adds.
  const catchUpNames = async () => {
    if (namesReady) return;
    if ((await namesReadyDoc.get()).exists) {
      namesReady = true;
      return;
    }
    const all = await db.collection('players').orderBy('createdAt').get();
    const seen = new Set<string>();
    let batch = db.batch();
    let writes = 0;
    for (const stored of all.docs) {
      const { uid, name } = stored.data() as Player;
      const key = nameKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      batch.set(nameDoc(key), { uid }, { merge: false });
      if (++writes === 400) {
        await batch.commit();
        batch = db.batch();
        writes = 0;
      }
    }
    batch.set(namesReadyDoc, { at: Date.now(), players: all.size });
    await batch.commit();
    namesReady = true;
  };
  const orderDocs = (uid: string) => playerDoc(uid).collection('orders');
  const groupDoc = (id: string) => db.collection('groups').doc(id);
  // All of a group's messages sit in one document, so reading the chat costs a single read.
  const chatDoc = (id: string) => db.collection('groupChats').doc(id);
  // The small photo the chat reads, and apart from it the larger picture only its owner opens.
  const photoDoc = (uid: string) => db.collection('photos').doc(uid);
  const originalDoc = (uid: string) => db.collection('photoOriginals').doc(uid);

  const findGroupByCode = async (code: string) => {
    const found = await db.collection('groups').where('code', '==', code).limit(1).get();
    return (found.docs[0]?.data() as Group | undefined) ?? null;
  };

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

    async nameOwner(key) {
      await catchUpNames();
      const stored = await nameDoc(key).get();
      return stored.exists ? (stored.data() as { uid: string }).uid : null;
    },

    async claimName(key, uid) {
      await catchUpNames();
      return db.runTransaction(async (tx) => {
        const stored = await tx.get(nameDoc(key));
        if (stored.exists) return (stored.data() as { uid: string }).uid === uid;
        tx.create(nameDoc(key), { uid });
        return true;
      });
    },

    async renamePlayer(uid, name, worldNow) {
      await catchUpNames();
      const key = nameKey(name);
      return db.runTransaction(async (tx) => {
        const player = (await tx.get(playerDoc(uid))).data() as Player | undefined;
        if (!player) return 'no-player' as const;
        const holder = (await tx.get(nameDoc(key))).data() as { uid: string } | undefined;
        if (holder && holder.uid !== uid) return 'taken' as const;
        const oldKey = nameKey(player.name);
        const oldHolder =
          oldKey === key ? undefined : ((await tx.get(nameDoc(oldKey))).data() as { uid: string } | undefined);
        const group = player.groupId
          ? ((await tx.get(groupDoc(player.groupId))).data() as Group | undefined)
          : undefined;
        const table = (await tx.get(tableDoc)).data() as LeagueTable | undefined;

        tx.set(nameDoc(key), { uid });
        if (oldHolder?.uid === uid) tx.delete(nameDoc(oldKey));
        tx.update(playerDoc(uid), { name, changedAt: Math.max(player.changedAt, worldNow) });
        if (group) tx.update(groupDoc(group.id), { members: renamedMember(group, uid, name).members });
        if (table?.rows.some((row) => row.id === uid)) tx.set(tableDoc, renamedRow(table, uid, name));
        return 'renamed' as const;
      });
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

    recordVisit(uid, today) {
      return db.runTransaction(async (tx) => {
        const stored = await tx.get(playerDoc(uid));
        if (!stored.exists) return null;
        const before = (stored.data() as Player).streak;
        const streak = nextStreak(before, today);
        if (streak !== before) tx.update(playerDoc(uid), { streak });
        return streak;
      });
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

    async setPhoto(uid, saved) {
      if (!(await playerDoc(uid).get()).exists) return false;
      const both = db.batch();
      if (saved) {
        both.set(photoDoc(uid), { photo: saved.photo });
        both.set(originalDoc(uid), { original: saved.original, crop: saved.crop });
      } else {
        both.delete(photoDoc(uid));
        both.delete(originalDoc(uid));
      }
      await both.commit();
      return true;
    },

    async getPhotoOriginal(uid) {
      const stored = await originalDoc(uid).get();
      return stored.exists ? (stored.data() as Omit<SavedPhoto, 'photo'>) : null;
    },

    async getPhotos(uids) {
      if (uids.length === 0) return {};
      const stored = await db.getAll(...uids.map(photoDoc));
      return Object.fromEntries(
        stored.flatMap((doc) => (doc.exists ? [[doc.id, (doc.data() as { photo: string }).photo]] : [])),
      );
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

    createGroup(group) {
      return db.runTransaction(async (tx) => {
        const stored = await tx.get(playerDoc(group.ownerId));
        const problem = createProblem((stored.data() as Player | undefined) ?? null);
        if (problem) return problem;
        tx.create(groupDoc(group.id), group);
        tx.update(playerDoc(group.ownerId), { groupId: group.id });
        return { group };
      });
    },

    async joinGroup(uid, code, joinedAt) {
      const found = await findGroupByCode(code);
      return db.runTransaction(async (tx) => {
        const [storedPlayer, storedGroup] = await tx.getAll(
          playerDoc(uid),
          groupDoc(found?.id ?? 'none'),
        );
        const player = (storedPlayer?.data() as Player | undefined) ?? null;
        const group = (storedGroup?.data() as Group | undefined) ?? null;
        const problem = joinProblem(player, group);
        if (problem || !player || !group) return problem ?? { problem: 'NO_GROUP' };
        const next = withMember(group, player, joinedAt);
        tx.update(groupDoc(group.id), { members: next.members });
        tx.update(playerDoc(uid), { groupId: group.id });
        return { group: next };
      });
    },

    leaveGroup(uid) {
      return db.runTransaction(async (tx) => {
        const player = (await tx.get(playerDoc(uid))).data() as Player | undefined;
        if (!player) return { problem: 'NO_PLAYER' };
        if (!player.groupId) return { problem: 'NO_GROUP' };
        const group = (await tx.get(groupDoc(player.groupId))).data() as Group | undefined;
        if (!group) return { problem: 'NO_GROUP' };
        const next = withoutMember(group, uid);
        if (next) {
          tx.set(groupDoc(group.id), next);
        } else {
          tx.delete(groupDoc(group.id));
          tx.delete(chatDoc(group.id));
        }
        tx.update(playerDoc(uid), { groupId: FieldValue.delete() });
        return { group: next };
      });
    },

    removeMember(ownerId, memberId) {
      return db.runTransaction(async (tx) => {
        const owner = (await tx.get(playerDoc(ownerId))).data() as Player | undefined;
        const stored = owner?.groupId ? await tx.get(groupDoc(owner.groupId)) : null;
        const group = (stored?.data() as Group | undefined) ?? null;
        const problem = removeProblem(group, ownerId, memberId);
        if (problem || !group) return problem ?? { problem: 'NO_GROUP' };
        const next = withoutMember(group, memberId);
        if (next) tx.set(groupDoc(group.id), next);
        tx.update(playerDoc(memberId), { groupId: FieldValue.delete() });
        return { group: next };
      });
    },

    changeGroupCode(ownerId, code) {
      return db.runTransaction(async (tx) => {
        const owner = (await tx.get(playerDoc(ownerId))).data() as Player | undefined;
        const stored = owner?.groupId ? await tx.get(groupDoc(owner.groupId)) : null;
        const group = (stored?.data() as Group | undefined) ?? null;
        const problem = ownerProblem(group, ownerId);
        if (problem || !group) return problem ?? { problem: 'NO_GROUP' };
        tx.update(groupDoc(group.id), { code });
        return { group: { ...group, code } };
      });
    },

    async getGroup(id) {
      return ((await groupDoc(id).get()).data() as Group | undefined) ?? null;
    },

    findGroupByCode,

    addMessage(uid, message) {
      return db.runTransaction(async (tx) => {
        const player = (await tx.get(playerDoc(uid))).data() as Player | undefined;
        if (!player) return { problem: 'NO_PLAYER' };
        if (!player.groupId) return { problem: 'NO_GROUP' };
        const chat = (await tx.get(chatDoc(player.groupId))).data() as Chat | undefined;
        const result = withMessage(chat?.messages ?? [], player, message);
        if (!Array.isArray(result)) return result;
        tx.set(chatDoc(player.groupId), { messages: result });
        return { group: null };
      });
    },

    async getMessages(groupId) {
      return ((await chatDoc(groupId).get()).data() as Chat | undefined)?.messages ?? [];
    },

    async deletePlayer(uid, realNow) {
      // Reading the settlement document makes a settlement that starts meanwhile retry this one.
      const result = await db.runTransaction(async (tx) => {
        const settlement = (await tx.get(settlementDoc)).data() as Settlement | undefined;
        if (settlement?.leaseOwner && (settlement.leaseUntil ?? 0) > realNow) return 'busy' as const;
        const player = (await tx.get(playerDoc(uid))).data() as Player | undefined;
        const group = player?.groupId
          ? ((await tx.get(groupDoc(player.groupId))).data() as Group | undefined)
          : undefined;
        const shards = (await tx.get(shardDocs)).docs.map((doc) => doc.data() as Shard);
        const table = ((await tx.get(tableDoc)).data() as LeagueTable | undefined) ?? null;
        // Their name, freed for someone else. Only if it's still theirs; missing means nothing to free.
        const name = player ? nameDoc(nameKey(player.name)) : null;
        const nameHolder = name ? ((await tx.get(name)).data() as { uid: string } | undefined) : undefined;

        if (group) {
          const next = withoutMember(group, uid);
          if (next) {
            tx.set(groupDoc(group.id), next);
          } else {
            tx.delete(groupDoc(group.id));
            tx.delete(chatDoc(group.id));
          }
        }
        for (const shard of shardsWithout(shards, uid)) tx.set(shardDocs.doc(shard.id), shard);
        const nextTable = tableWithout(table, uid);
        if (nextTable) tx.set(tableDoc, nextTable);
        tx.delete(photoDoc(uid));
        tx.delete(originalDoc(uid));
        if (name && nameHolder?.uid === uid) tx.delete(name);
        tx.delete(playerDoc(uid));
        return 'deleted' as const;
      });
      // Orders can be more than one transaction holds. With the player gone, nothing adds more.
      if (result === 'deleted') await db.recursiveDelete(orderDocs(uid));
      return result;
    },

    editLeague(realNow, edit) {
      return db.runTransaction(async (tx) => {
        const settlement = (await tx.get(settlementDoc)).data() as Settlement | undefined;
        if (settlement?.leaseOwner && (settlement.leaseUntil ?? 0) > realNow) return 'busy' as const;
        const shards = (await tx.get(shardDocs)).docs.map((doc) => doc.data() as Shard);
        const table = ((await tx.get(tableDoc)).data() as LeagueTable | undefined) ?? null;
        const change = edit(shards, table);
        if (!change) return 'unchanged' as const;
        for (const shard of change.shards) tx.set(shardDocs.doc(shard.id), shard);
        if (change.table) tx.set(tableDoc, change.table);
        return 'done' as const;
      });
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
