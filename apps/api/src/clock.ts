// The shared world clock. One stored anchor, so time passes with nothing ticking.
// Moving the clock by hand comes with the admin tools. This file only reads it.

import { WORLD_START } from '@portfolio-league/engine';

export type Clock = {
  anchorWorld: number;
  anchorReal: number;
  speed: number; // world milliseconds per real millisecond
  paused: boolean;
  // The emergency brake: new orders are refused while prices, settlement and the table go on.
  // Kept on the clock because every order already reads it, so checking it costs nothing.
  tradingPaused?: boolean;
};

const DEFAULT_SPEED = 7; // one world week per real day

export const firstClock = (realNow: number): Clock => ({
  anchorWorld: WORLD_START,
  anchorReal: realNow,
  speed: DEFAULT_SPEED,
  paused: false,
});

export const worldTime = (clock: Clock, realNow: number): number =>
  clock.paused
    ? clock.anchorWorld
    : clock.anchorWorld + Math.floor((realNow - clock.anchorReal) * clock.speed);

/** Starts a new anchor at the current world time, so a change can't make time jump. */
const reanchored = (clock: Clock, realNow: number): Clock => ({
  ...clock,
  anchorWorld: worldTime(clock, realNow),
  anchorReal: realNow,
});

/** Forward only. Asking for a time already passed changes nothing, so a double click is safe. */
export function advancedTo(clock: Clock, target: number, realNow: number): Clock {
  const current = reanchored(clock, realNow);
  return target > current.anchorWorld ? { ...current, anchorWorld: target } : current;
}

export const paused = (clock: Clock, realNow: number, value: boolean): Clock => ({
  ...reanchored(clock, realNow),
  paused: value,
});

/** Time doesn't move, so there's no need for a new anchor. */
export const withTrading = (clock: Clock, open: boolean): Clock => ({ ...clock, tradingPaused: !open });

export const withSpeed = (clock: Clock, realNow: number, speed: number): Clock => ({
  ...reanchored(clock, realNow),
  speed,
});
