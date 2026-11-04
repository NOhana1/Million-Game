// TEMPORARY stand-in until the engine's world generator exists. Prices wander around a
// fixed level, with no real market behaviour. Same seed and time always give the same price.

import { FX_SCALE, isMarketOpen, type Market, PRICE_SCALE } from '@portfolio-league/engine';

import type { Listing, PriceFeed } from './feed.ts';

type Row = [id: string, name: string, sector: string, market: Market, price: number, vol: number];

const ROWS: Row[] = [
  ['TAIX', 'Tel Aviv Broad Index Fund', 'Fund', 'TASE', 212.4, 0.008],
  ['SHRN', 'Sharon Bank', 'Banks', 'TASE', 34.15, 0.015],
  ['HGLL', 'HaGalil Foods', 'Consumer', 'TASE', 88.6, 0.01],
  ['NGVS', 'Negev Solar', 'Energy', 'TASE', 19.72, 0.03],
  ['YMSH', 'Yam Shipping', 'Transport', 'TASE', 57.3, 0.025],
  ['ARVA', 'Arava Pharma', 'Health', 'TASE', 146.9, 0.02],
  ['KNRT', 'Kinneret Real Estate', 'Real estate', 'TASE', 41.05, 0.015],
  ['CYBR', 'Tzafon Cyber', 'Technology', 'TASE', 263.0, 0.028],
  ['MTLA', 'Metula Telecom', 'Telecom', 'TASE', 12.84, 0.012],
  ['EILT', 'Eilat Insurance', 'Insurance', 'TASE', 73.5, 0.015],
  ['USIX', 'US Broad Index Fund', 'Fund', 'US', 508.2, 0.008],
  ['USTX', 'US Tech Index Fund', 'Fund', 'US', 431.75, 0.012],
  ['MRDN', 'Meridian Chips', 'Technology', 'US', 186.3, 0.03],
  ['SMTC', 'Summit Cloud', 'Technology', 'US', 94.1, 0.025],
  ['ATLP', 'Atlas Payments', 'Finance', 'US', 141.6, 0.018],
  ['RDWB', 'Redwood Bio', 'Health', 'US', 38.45, 0.035],
  ['BLPK', 'Bluepeak Energy', 'Energy', 'US', 72.9, 0.02],
  ['LKSR', 'Lakeshore Retail', 'Consumer', 'US', 118.2, 0.012],
  ['IRBR', 'Ironbridge Industrial', 'Industrial', 'US', 205.5, 0.014],
  ['PRFD', 'Prairie Foods', 'Consumer', 'US', 61.3, 0.009],
];

const TICK_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const GRID_MS = 10 * 60 * 1000;

/** A repeatable number from -1 to 1 for a piece of text. */
function noise(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  hash = Math.imul(hash ^ (hash >>> 15), 2246822519);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489917);
  return ((hash ^ (hash >>> 16)) >>> 0) / 2147483648 - 1;
}

/** Prices stand still while a market is closed, so step back to when it last traded. */
function lastTraded(market: Market, ms: number): number {
  if (isMarketOpen(market, ms)) return ms;
  let t = Math.floor(ms / GRID_MS) * GRID_MS;
  while (!isMarketOpen(market, t)) t -= GRID_MS;
  return t;
}

const wander = (seed: string, key: string, ms: number) =>
  noise(`${seed}:${key}:day:${Math.floor(ms / DAY_MS)}`) * 2 +
  noise(`${seed}:${key}:tick:${Math.floor(ms / TICK_MS)}`) * 0.5;

export function temporaryFeed(seed: string): PriceFeed {
  const listings: Listing[] = ROWS.map(([id, name, sector, market]) => ({ id, name, sector, market }));
  const rows = new Map(ROWS.map((row) => [row[0], row]));

  return {
    listings,

    priceAt(securityId, ms) {
      const row = rows.get(securityId);
      if (!row) throw new Error(`Unknown security ${securityId}`);
      const [, , , market, price, vol] = row;
      const moved = 1 + vol * wander(seed, securityId, lastTraded(market, ms));
      return Math.round(price * moved * PRICE_SCALE);
    },

    usdIlsAt(ms) {
      const traded = Math.max(lastTraded('TASE', ms), lastTraded('US', ms));
      return Math.round(3.42 * (1 + 0.004 * wander(seed, 'USDILS', traded)) * FX_SCALE);
    },
  };
}
