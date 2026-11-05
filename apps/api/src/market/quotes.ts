// The only code that reads the price feed, and it never looks past the time it's given.
// Every route passes the current world time, so nothing later can reach a player.

import {
  isMarketOpen,
  nextSessionChange,
  type QuoteSource,
  quoteFor,
  WORLD_START,
} from '@portfolio-league/engine';

import type { Listing, PriceFeed } from './feed.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 5;
const HISTORY_STEP_MS = 30 * 60 * 1000;

export const findListing = (feed: PriceFeed, id: string): Listing | undefined =>
  feed.listings.find((listing) => listing.id === id);

export function quotesAt(feed: PriceFeed, world: number): QuoteSource {
  return (securityId) => {
    const listing = findListing(feed, securityId);
    if (!listing) throw new Error(`Unknown security ${securityId}`);
    return quoteFor(listing.market, feed.priceAt(securityId, world), feed.usdIlsAt(world));
  };
}

/** Each price step in a period, as quotes the engine can replay. */
export function priceSteps(feed: PriceFeed, from: number, to: number): QuoteSource[] {
  const markets = new Map(feed.listings.map((listing) => [listing.id, listing.market]));
  return feed.stepsBetween(from, to).map((step) => (securityId) => {
    const market = markets.get(securityId);
    const price = step.prices[securityId];
    if (!market || price === undefined) throw new Error(`Unknown security ${securityId}`);
    return quoteFor(market, price, step.fx);
  });
}

export const worldStatus = (world: number) => ({
  worldTime: world,
  markets: {
    TASE: { open: isMarketOpen('TASE', world), nextChange: nextSessionChange('TASE', world) },
    US: { open: isMarketOpen('US', world), nextChange: nextSessionChange('US', world) },
  },
});

export const marketSnapshot = (feed: PriceFeed, world: number) => ({
  worldTime: world,
  usdIls: feed.usdIlsAt(world),
  usdIlsDayAgo: feed.usdIlsAt(world - DAY_MS),
  securities: feed.listings.map((listing) => ({
    ...listing,
    price: feed.priceAt(listing.id, world),
    priceDayAgo: feed.priceAt(listing.id, world - DAY_MS),
  })),
});

/** Prices for a chart: the last few days of trading, ending exactly at the given time. */
export function priceHistory(feed: PriceFeed, listing: Listing, world: number) {
  const points: { at: number; price: number }[] = [];
  const start = Math.max(world - HISTORY_DAYS * DAY_MS, WORLD_START); // no days before the world
  const first = Math.ceil(start / HISTORY_STEP_MS) * HISTORY_STEP_MS;
  for (let at = first; at < world; at += HISTORY_STEP_MS) {
    if (isMarketOpen(listing.market, at)) points.push({ at, price: feed.priceAt(listing.id, at) });
  }
  points.push({ at: world, price: feed.priceAt(listing.id, world) });
  return { worldTime: world, securityId: listing.id, points };
}
