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
};

export type Decision = { player: Player; order: Order };

export type PlaceOrder = {
  uid: string;
  orderId: string;
  realNow: number;
  /** Throw to refuse. May run more than once, so it must have no side effects. */
  decide(player: Player | null, clock: Clock): Decision;
};

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
};
