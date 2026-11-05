// Everything the API needs from a database. Routes never touch Firestore directly,
// so tests and local runs can use the in-memory store.

import type { Agorot, Order, Units } from '@portfolio-league/engine';

import type { Clock } from '../clock.ts';

export type Player = {
  uid: string;
  name: string;
  createdAt: number; // real time
  cash: Agorot;
  holdings: Record<string, Units>;
  pendingOrders: Order[]; // filled orders live in the player's order history
  nextDueAt: number | null; // earliest pending execution, so settlement can find this player
};

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
  /** Moves the cursor forward. False means this run lost the lease and must stop. */
  saveCursor(owner: string, cursor: number): Promise<boolean>;
  endSettlement(owner: string): Promise<void>;
  /** Players with an order due by `upTo`. */
  duePlayers(upTo: number, limit: number): Promise<string[]>;
  /**
   * All or nothing, on the latest stored player, so filling twice can't happen: the second
   * run finds the order no longer pending. Returns how many orders were filled.
   */
  settlePlayer(uid: string, settle: (player: Player) => Settled): Promise<number>;
};
