// The shared world clock. One stored anchor, so time passes with nothing ticking.
// Moving the clock by hand comes with the admin tools. This file only reads it.

import { WORLD_START } from '@portfolio-league/engine';

export type Clock = {
  anchorWorld: number;
  anchorReal: number;
  speed: number; // world milliseconds per real millisecond
  paused: boolean;
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
