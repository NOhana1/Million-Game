// The only code that reads the price feed, and it never looks past the time it's given.
// Every route passes the current world time, so nothing later can reach a player.

import {
  isMarketOpen,
  nextSessionChange,
  type PricePoint,
  type QuoteSource,
  quoteFor,
  SAMPLE_HOUR_UTC,
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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_POINTS = 320; // plenty for a line, and small enough to download quickly
const FEW_POINTS = 12; // a one day chart with fewer than this has landed on a weekend
const MAX_EXTRA_DAYS = 6;
const SPARK_DAYS = 7;
const SPARK_STEP_MS = 4 * HOUR_MS;

/** How far back each chart button looks, and how often it samples the game's own prices. */
export const RANGES = {
  '1D': { days: 1, stepMs: 5 * MINUTE_MS },
  '1W': { days: 7, stepMs: 30 * MINUTE_MS },
  '1M': { days: 30, stepMs: 2 * HOUR_MS },
  '3M': { days: 91, stepMs: DAY_MS },
  '6M': { days: 182, stepMs: DAY_MS },
  '1Y': { days: 365, stepMs: DAY_MS },
  '5Y': { days: 1826, stepMs: DAY_MS },
  ALL: { days: Number.POSITIVE_INFINITY, stepMs: DAY_MS },
} as const;

export type Range = keyof typeof RANGES;

export const isRange = (text: string | undefined): text is Range =>
  text !== undefined && Object.hasOwn(RANGES, text);

/** The game's own prices, never at or after `world`, so a chart can't show the future. */
function gamePrices(feed: PriceFeed, listing: Listing, from: number, world: number, stepMs: number) {
  const points: PricePoint[] = [];
  const start = Math.max(from, WORLD_START);
  // Daily samples land inside the session. Shorter steps only need to line up with the clock.
  const offset = stepMs === DAY_MS ? SAMPLE_HOUR_UTC[listing.market] * HOUR_MS : 0;
  const first = Math.ceil((start - offset) / stepMs) * stepMs + offset;
  for (let at = first; at < world; at += stepMs) {
    if (isMarketOpen(listing.market, at)) points.push({ at, price: feed.priceAt(listing.id, at) });
  }
  return points;
}

/** Skips the work when a range doesn't reach back that far. */
const pricesBeforeGame = (feed: PriceFeed, listing: Listing, from: number) =>
  from < WORLD_START ? feed.pastPrices(listing.id).filter((point) => point.at >= from) : [];

/** Keeps every nth point, so a long range stays light. */
function thinned(points: readonly PricePoint[]) {
  const every = Math.ceil(points.length / MAX_POINTS);
  return points.filter((_, index) => index % every === 0);
}

/**
 * Prices for one chart button: simulated history up to the game's start, then the game's own
 * prices, ending exactly at the given time.
 */
export function rangeHistory(feed: PriceFeed, listing: Listing, world: number, range: Range) {
  const { days, stepMs } = RANGES[range];
  let from = world - days * DAY_MS;
  let game = gamePrices(feed, listing, from, world, stepMs);
  for (let extra = 0; range === '1D' && game.length < FEW_POINTS && extra < MAX_EXTRA_DAYS; extra += 1) {
    from -= DAY_MS;
    game = gamePrices(feed, listing, from, world, stepMs);
  }
  const past = pricesBeforeGame(feed, listing, from);
  return {
    worldTime: world,
    securityId: listing.id,
    range,
    gameStartedAt: WORLD_START,
    points: [
      ...thinned([...past, ...game]),
      { at: world, price: feed.priceAt(listing.id, world) },
    ],
  };
}

/** A small line for every security in the market list. */
export function marketSparks(feed: PriceFeed, world: number) {
  const from = world - SPARK_DAYS * DAY_MS;
  return Object.fromEntries(
    feed.listings.map((listing) => [
      listing.id,
      [
        ...pricesBeforeGame(feed, listing, from),
        ...gamePrices(feed, listing, from, world, SPARK_STEP_MS),
        { at: world, price: feed.priceAt(listing.id, world) },
      ].map((point) => point.price),
    ]),
  );
}

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

/** The dollar's ranges: it only exists since the game began, so the long ones would all match. */
export const DOLLAR_RANGES = ['1D', '1W', '1M', '3M', '6M', 'ALL'] as const satisfies readonly Range[];
export const DOLLAR_ID = 'USDILS';

const anyMarketOpen = (at: number) => isMarketOpen('TASE', at) || isMarketOpen('US', at);

/**
 * The game's dollar rate for one chart button, as shekels per dollar with 4 decimals, like a
 * price. It only moves while a market trades, so the chart samples only then. Never past `world`.
 */
export function dollarHistory(feed: PriceFeed, world: number, range: Range) {
  const { days, stepMs } = RANGES[range];
  let from = Math.max(world - days * DAY_MS, WORLD_START);
  const sample = (start: number) => {
    const points: PricePoint[] = [];
    const offset = stepMs === DAY_MS ? SAMPLE_HOUR_UTC.US * HOUR_MS : 0;
    const first = Math.ceil((start - offset) / stepMs) * stepMs + offset;
    for (let at = first; at < world; at += stepMs) {
      if (anyMarketOpen(at)) points.push({ at, price: feed.usdIlsAt(at) });
    }
    return points;
  };
  let points = sample(from);
  for (let extra = 0; range === '1D' && points.length < FEW_POINTS && extra < MAX_EXTRA_DAYS; extra += 1) {
    from = Math.max(from - DAY_MS, WORLD_START);
    points = sample(from);
  }
  return {
    worldTime: world,
    securityId: DOLLAR_ID,
    range,
    gameStartedAt: WORLD_START,
    points: [...thinned(points), { at: world, price: feed.usdIlsAt(world) }],
  };
}
