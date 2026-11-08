// What the watchdog reads to tell whether orders are being filled on time. It only reads: the
// filling itself is the alarm's job, so checking can never change the game.
//
// Two signs of trouble:
//   1. A market open or close has passed but hasn't been worked through yet (the cursor is behind).
//   2. Some player's order has been due for a while and is still waiting.
// Both are measured in real minutes, so the clock's speed doesn't change the meaning.

import { nextMarketEvent } from '@portfolio-league/engine';
import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { type Clock, worldTime } from '../clock.ts';

/** The alarm knocks every minute, with a backup every 15. Ten real minutes behind is a problem. */
export const LATE_AFTER_MS = 10 * 60_000;
const CACHED_SECONDS = 60; // no stale answers: the watchdog must see a fresh one

export type FillStatus = {
  late: boolean;
  slotLateSeconds: number; // how long a passed open or close has waited, in real seconds
  overdueOrders: boolean; // an order due more than LATE_AFTER_MS ago is still waiting
};

/** Real milliseconds since a world moment passed, at this clock's speed. */
const realSince = (clock: Clock, world: number, moment: number) =>
  moment <= world ? (world - moment) / clock.speed : 0;

export function fillStatus(clock: Clock, cursor: number, realNow: number, overdueOrders: boolean): FillStatus {
  // A paused clock doesn't move, so nothing can become due.
  if (clock.paused) return { late: false, slotLateSeconds: 0, overdueOrders: false };
  const world = worldTime(clock, realNow);
  const slotLate = realSince(clock, world, nextMarketEvent(cursor));
  return {
    late: slotLate > LATE_AFTER_MS || overdueOrders,
    slotLateSeconds: Math.round(slotLate / 1000),
    overdueOrders,
  };
}

export function statusRoutes(deps: Deps) {
  const routes = new Hono();

  routes.get('/status', async (c) => {
    const realNow = deps.now();
    const [clock, cursor] = await Promise.all([deps.store.getClock(realNow), deps.store.getCursor()]);
    const world = worldTime(clock, realNow);
    // One player whose order has been waiting too long is enough to know. Reads at most one.
    const overdue =
      !clock.paused && (await deps.store.duePlayers(world - LATE_AFTER_MS * clock.speed, 1)).length > 0;

    c.header('Cache-Control', `public, max-age=0, s-maxage=${CACHED_SECONDS}`);
    return c.json({
      checkedAt: realNow,
      worldTime: world,
      clock: { paused: clock.paused, tradingPaused: clock.tradingPaused ?? false, speed: clock.speed },
      settledUpTo: cursor,
      fills: fillStatus(clock, cursor, realNow, overdue),
    });
  });

  return routes;
}
