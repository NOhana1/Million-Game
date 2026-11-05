// The real prices. Create this once per server: it keeps every price step in memory.

import { createWorld, SECURITIES } from '@portfolio-league/engine';
import { secureNoise } from '@portfolio-league/engine/secure-noise';

import type { PriceFeed } from './feed.ts';

export function worldFeed(seed: string): PriceFeed {
  const world = createWorld(secureNoise(seed));
  return {
    listings: SECURITIES.map(({ id, name, sector, market }) => ({ id, name, sector, market })),
    priceAt: world.priceAt,
    usdIlsAt: world.usdIlsAt,
  };
}
