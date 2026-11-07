// The real prices. Create this once per server: it keeps every price step in memory.

import { createWorld, pastPrices, type PricePoint, SECURITIES } from '@portfolio-league/engine';
import { secureNoise } from '@portfolio-league/engine/secure-noise';

import type { PriceFeed } from './feed.ts';

export function worldFeed(seed: string): PriceFeed {
  const noise = secureNoise(seed);
  const world = createWorld(noise);
  const past = new Map<string, readonly PricePoint[]>();
  return {
    listings: SECURITIES.map(({ id, name, sector, market }) => ({ id, name, sector, market })),
    priceAt: world.priceAt,
    usdIlsAt: world.usdIlsAt,
    stepsBetween: world.stepsBetween,
    pastPrices(securityId) {
      const security = SECURITIES.find((s) => s.id === securityId);
      if (!security) throw new Error(`Unknown security ${securityId}`);
      const prices = past.get(securityId) ?? pastPrices(noise, security);
      past.set(securityId, prices);
      return prices;
    },
  };
}
