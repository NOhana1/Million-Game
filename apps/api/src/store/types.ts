// Everything the API needs from a database. Routes never touch Firestore directly,
// so tests and local runs can use the in-memory store.

import type { Agorot, Division, Order, Ranked, Units, WeekRecord } from '@portfolio-league/engine';

import type { Clock } from '../clock.ts';
import type { Streak } from '../services/streak.ts';

export type Player = {
  uid: string;
  name: string;
  createdAt: number; // real time
  cash: Agorot;
  holdings: Record<string, Units>;
  pendingOrders: Order[]; // filled orders live in the player's order history
  nextDueAt: number | null; // earliest pending execution, so settlement can find this player
  changedAt: number; // world time of the last change the league must pick up
  goal?: Agorot; // the portfolio value the player is aiming for
  watchlist?: string[]; // the security ids they follow
  groupId?: string; // a player is in one group at most
  streak?: Streak; // days in a row the player opened the game
};

export type GroupMember = { id: string; name: string; joinedAt: number };

export type Group = {
  id: string;
  name: string;
  code: string; // what a friend types to join
  ownerId: string;
  createdAt: number; // real time
  members: GroupMember[];
};

/** How the player framed their picture: zoom from 1, and how far it moved, as a share of the frame. */
export type PhotoCrop = { zoom: number; x: number; y: number };
/** The small square everyone sees, and the larger picture it was cut from, kept for adjusting later. */
export type SavedPhoto = { photo: string; original: string; crop: PhotoCrop };

export type ChatMessage = { id: string; uid: string; name: string; text: string; at: number };

export type GroupProblem =
  | 'NO_PLAYER'
  | 'IN_GROUP'
  | 'NO_GROUP'
  | 'GROUP_FULL'
  | 'NOT_OWNER'
  | 'NOT_MEMBER'
  | 'TOO_FAST';

export type GroupChange = { group: Group | null } | { problem: GroupProblem };

export const MOST_MEMBERS = 20;
export const MOST_MESSAGES = 50; // a group keeps only its latest messages
export const MESSAGE_GAP_MS = 1500;

/** A competitor in a league shard: a real player's position, or a whole bot. */
export type Member = {
  id: string;
  name: string;
  bot: boolean;
  cash: Agorot; // for real players, this includes cash held for pending buys
  holdings: Record<string, Units>;
  orders: Order[]; // only bots keep orders here
  week: WeekRecord;
  division?: Division; // missing means the first division
};

export type Shard = { id: string; members: Record<string, Member> };

export type TableRow = Ranked & {
  rank: number;
  name: string;
  bot: boolean;
  value: Agorot;
  division: Division;
  nextDivision?: Division; // on finished weeks only: where this week's result moved them
};

export type LeagueTable = {
  updatedAt: number;
  weekEndsAt: number;
  previousWeekEndsAt: number | null;
  total: number;
  rows: TableRow[];
  indexes: Record<string, number>; // each index fund's return this week, in shekels, as ppm
};

/** Everything one market open or close changes, saved together with the cursor. */
export type SlotSave = { shards: Shard[]; table: LeagueTable | null; finishedWeek?: LeagueTable };

export type Decision = { player: Player; order: Order };

export type PlaceOrder = {
  uid: string;
  orderId: string;
  realNow: number;
  /** Throw to refuse. May run more than once, so it must have no side effects. */
  decide(player: Player | null, clock: Clock): Decision;
};

export type Settled = { player: Player; filled: Order[] };

export type Lease = { owner: string; realNow: number; ttlMs: number };

export type OrderCursor = { placedAt: number; id: string };

export type Store = {
  /** The world clock. The first ever call starts it at `realNow`. */
  getClock(realNow: number): Promise<Clock>;
  /** All or nothing, on the latest stored clock. */
  updateClock(realNow: number, change: (clock: Clock) => Clock): Promise<Clock>;
  getPlayer(uid: string): Promise<Player | null>;
  /**
   * Who holds a player name, by its key (see player-names.ts), or null if it's free. Players who
   * joined before names were kept count too: the first time, the store reads them all once.
   */
  nameOwner(key: string): Promise<string | null>;
  /** Takes a name for a player, all or nothing. False means someone else already holds it. */
  claimName(key: string, uid: string): Promise<boolean>;
  /** Creates the player unless one exists, and returns whichever is stored. */
  createPlayer(player: Player): Promise<{ player: Player; created: boolean }>;
  /** Changes only the goal, so it can't overwrite a fill. False means there's no such player. */
  setGoal(uid: string, goal: number): Promise<boolean>;
  /**
   * Counts today's visit toward the streak, changing only the streak. All or nothing, so two tabs
   * opening at once count once. Null means there's no such player.
   */
  recordVisit(uid: string, today: string): Promise<Streak | null>;
  /** Changes only the watchlist, for the same reason. False means there's no such player. */
  setWatchlist(uid: string, ids: string[]): Promise<boolean>;
  /**
   * A small square picture as a data URL, or null to remove it. Kept apart from the player,
   * so the reads that happen all the time stay small. False means there's no such player.
   */
  setPhoto(uid: string, saved: SavedPhoto | null): Promise<boolean>;
  /** The small photos only. Only the players who have one appear. */
  getPhotos(uids: string[]): Promise<Record<string, string>>;
  /** The larger picture and its framing, so its owner can adjust it. */
  getPhotoOriginal(uid: string): Promise<Omit<SavedPhoto, 'photo'> | null>;
  /**
   * All or nothing. If this order id already exists for the player, returns it unchanged,
   * so a retry or double tap can't place a second order.
   */
  placeOrder(input: PlaceOrder): Promise<{ order: Order; created: boolean }>;
  /** Newest first. */
  listOrders(uid: string, page: { limit: number; after?: OrderCursor }): Promise<Order[]>;

  /** All the group calls are all or nothing, so a member can't end up half in a group. */
  createGroup(group: Group): Promise<GroupChange>;
  joinGroup(uid: string, code: string, joinedAt: number): Promise<GroupChange>;
  /** The next member takes over from an owner who leaves. The last one out deletes the group. */
  leaveGroup(uid: string): Promise<GroupChange>;
  removeMember(ownerId: string, memberId: string): Promise<GroupChange>;
  /** Owner only. The old code stops working at once. */
  changeGroupCode(ownerId: string, code: string): Promise<GroupChange>;
  getGroup(id: string): Promise<Group | null>;
  findGroupByCode(code: string): Promise<Group | null>;
  addMessage(uid: string, message: Omit<ChatMessage, 'uid' | 'name'>): Promise<GroupChange>;
  getMessages(groupId: string): Promise<ChatMessage[]>;

  /** The world time settlement has finished up to. */
  getCursor(): Promise<number>;
  /** Takes the settlement lease and returns the cursor, or null if another run holds it. */
  startSettlement(lease: Lease): Promise<number | null>;
  /** All or nothing, with the cursor. False means this run lost the lease and must stop. */
  saveSlot(owner: string, cursor: number, save: SlotSave): Promise<boolean>;
  endSettlement(owner: string): Promise<void>;
  getShards(): Promise<Shard[]>;
  getTable(): Promise<LeagueTable | null>;
  getFinishedWeek(endsAt: number): Promise<LeagueTable | null>;
  listFinishedWeeks(): Promise<LeagueTable[]>;
  /** Players who changed at or after this world time. */
  playersChangedSince(cursor: number): Promise<Player[]>;
  /** Players with an order due by `upTo`. */
  duePlayers(upTo: number, limit: number): Promise<string[]>;
  /**
   * All or nothing, on the latest stored player, so filling twice can't happen: the second
   * run finds the order no longer pending. Returns how many orders were filled.
   */
  settlePlayer(uid: string, settle: (player: Player) => Settled): Promise<number>;
};
