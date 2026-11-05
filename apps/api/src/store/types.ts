// Everything the API needs from a database. Routes never touch Firestore directly,
// so tests and local runs can use the in-memory store.

import type { Agorot, Order, Ranked, Units, WeekRecord } from '@portfolio-league/engine';

import type { Clock } from '../clock.ts';

export type Player = {
  uid: string;
  name: string;
  createdAt: number; // real time
  cash: Agorot;
  holdings: Record<string, Units>;
  pendingOrders: Order[]; // filled orders live in the player's order history
  nextDueAt: number | null; // earliest pending execution, so settlement can find this player
  changedAt: number; // world time of the last change the league must pick up
};

/** A competitor in a league shard: a real player's position, or a whole bot. */
export type Member = {
  id: string;
  name: string;
  bot: boolean;
  cash: Agorot; // for real players, this includes cash held for pending buys
  holdings: Record<string, Units>;
  orders: Order[]; // only bots keep orders here
  week: WeekRecord;
};

export type Shard = { id: string; members: Record<string, Member> };

export type TableRow = Ranked & { rank: number; name: string; bot: boolean; value: Agorot };

export type LeagueTable = {
  updatedAt: number;
  weekEndsAt: number;
  previousWeekEndsAt: number | null;
  total: number;
  rows: TableRow[];
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
  /** Creates the player unless one exists, and returns whichever is stored. */
  createPlayer(player: Player): Promise<{ player: Player; created: boolean }>;
  /**
   * All or nothing. If this order id already exists for the player, returns it unchanged,
   * so a retry or double tap can't place a second order.
   */
  placeOrder(input: PlaceOrder): Promise<{ order: Order; created: boolean }>;
  /** Newest first. */
  listOrders(uid: string, page: { limit: number; after?: OrderCursor }): Promise<Order[]>;

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
