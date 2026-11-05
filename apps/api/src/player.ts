import type { Account, Order } from '@portfolio-league/engine';

import type { Player } from './store/types.ts';

export const toAccount = (player: Player): Account => ({
  cash: player.cash,
  holdings: player.holdings,
  orders: player.pendingOrders,
});

/** Keeps `nextDueAt` true, so settlement can find this player with one query. */
export const withPending = (player: Player, pendingOrders: Order[]): Player => ({
  ...player,
  pendingOrders,
  nextDueAt: pendingOrders.length
    ? Math.min(...pendingOrders.map((order) => order.execution.at))
    : null,
});
