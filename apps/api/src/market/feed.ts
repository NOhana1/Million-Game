import type { FxRate, Price, Security, WorldState } from '@portfolio-league/engine';

export type Listing = Security & { name: string; sector: string };

/**
 * Where prices come from. Only src/market/quotes.ts may call it, because the feed can
 * answer for any time, including the future.
 */
export type PriceFeed = {
  listings: readonly Listing[];
  priceAt(securityId: string, ms: number): Price;
  usdIlsAt(ms: number): FxRate;
  /** The price steps after `from`, up to and including `to`. */
  stepsBetween(from: number, to: number): WorldState[];
};
