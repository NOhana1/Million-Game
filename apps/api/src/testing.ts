// Test helpers: an app with an in-memory store, where the token is simply the user id.

import { createApp, type Deps } from './app.ts';
import type { Clock } from './clock.ts';
import { worldFeed } from './market/world-feed.ts';
import { memoryStore } from './store/memory.ts';

/** Mon 9 Nov 2026, 12:00 in Israel: Tel Aviv is open and the US is closed. */
export const TEST_WORLD = Date.UTC(2026, 10, 9, 10, 0);

export const pausedAt = (world: number): Clock => ({
  anchorWorld: world,
  anchorReal: 0,
  speed: 1,
  paused: true,
});

export const testApp = (overrides: Partial<Deps> = {}) =>
  createApp({
    version: 'test',
    store: memoryStore(pausedAt(TEST_WORLD)),
    feed: worldFeed('test'),
    verifyToken: async (token) => (token === 'invalid' ? null : token),
    now: () => 0,
    ...overrides,
  });

export type TestApp = ReturnType<typeof testApp>;
