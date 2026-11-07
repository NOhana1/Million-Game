// Test helpers: an app with an in-memory store, where the token is simply the user id.

import { createApp, type Deps } from './app.ts';
import type { Clock } from './clock.ts';
import { worldFeed } from './market/world-feed.ts';
import type { Limits } from './rate-limit.ts';
import { memoryStore } from './store/memory.ts';

/** Mon 9 Nov 2026, 12:00 in Israel: Tel Aviv is open and the US is closed. */
export const TEST_WORLD = Date.UTC(2026, 10, 9, 10, 0);

export const pausedAt = (world: number): Clock => ({
  anchorWorld: world,
  anchorReal: 0,
  speed: 1,
  paused: true,
});

/** Game-rule tests create many players from one address, so they run without limits. */
export const NO_LIMITS: Limits = {
  read: { perAddress: Infinity, perPlayer: Infinity },
  costly: { perAddress: Infinity, perPlayer: Infinity },
  write: { perAddress: Infinity, perPlayer: Infinity },
  signup: { perAddress: Infinity, perPlayer: Infinity },
  secret: { perAddress: Infinity, perPlayer: Infinity },
};

export const testApp = (overrides: Partial<Deps> = {}) =>
  createApp({
    version: 'test',
    environment: 'test',
    store: memoryStore(pausedAt(TEST_WORLD)),
    feed: worldFeed('test'),
    verifyToken: async (token) => (token === 'invalid' ? null : token),
    now: () => 0,
    tickSecret: 'test-secret',
    clockSecret: 'clock-secret',
    limits: NO_LIMITS,
    ...overrides,
  });

export type TestApp = ReturnType<typeof testApp>;
