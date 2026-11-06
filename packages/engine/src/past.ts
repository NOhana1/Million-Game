// Simulated history from before the game starts, so long charts have something to show. It's
// made up on purpose, like everything in this world. It only feeds charts: no order, score or
// game price ever reads it, so it can't change the game.

import { isMarketOpen, type Market } from './calendar.ts';
import type { Price } from './money.ts';
import type { WorldSecurity } from './securities.ts';
import {
  jumpFrom,
  MARKET_SHARE,
  type Noise,
  normalFrom,
  OWN_SHARE,
  SECTOR_SHARE,
  WORLD_START,
} from './world.ts';

export type PricePoint = { at: number; price: Price };

const DAY_MS = 24 * 60 * 60 * 1000;
const PAST_DAYS = 3653; // ten years

/** A time of day when each market is open, in every season. */
export const SAMPLE_HOUR_UTC: Record<Market, number> = { TASE: 10, US: 18 };

const MIN_DRIFT = 0.0001; // the typical daily rise, so prices tend to grow over the years
const EXTRA_DRIFT = 0.0005;
const WORD_RANGE = 2 ** 32;

// Calm and rough stretches a few months long, so a long chart has rallies and slumps.
const SEASON_DAYS = 120;
const SEASON_SIZE = 0.0018;
const LARGEST_DAILY_FALL = -0.2;
const TREND_PULL = 0.003; // keeps a volatile stock from wandering absurdly far over ten years

const key = (kind: string, name: string, day: number) => `past|${kind}|${name}|${day}`;

/**
 * Walks back from the price the game starts at, so the line joins the game's own prices with no
 * jump. Returns one price per trading day, oldest first.
 */
export function pastPrices(noise: Noise, security: WorldSecurity): PricePoint[] {
  const drift = MIN_DRIFT + EXTRA_DRIFT * ((noise(`past|drift|${security.id}`)[0] ?? 0) / WORD_RANGE);
  const firstDay = Math.floor(WORLD_START / DAY_MS);
  const points: PricePoint[] = [];
  let price: number = security.startPrice;
  let trend: number = security.startPrice;

  for (let back = 1; back <= PAST_DAYS; back += 1) {
    const day = firstDay - back;
    const at = day * DAY_MS + SAMPLE_HOUR_UTC[security.market] * 60 * 60 * 1000;
    if (!isMarketOpen(security.market, at)) continue;

    const season = normalFrom(noise(key('season', 'market', Math.floor(day / SEASON_DAYS))));
    const own = noise(key('own', security.id, day));
    const move =
      security.dailyVol *
        (MARKET_SHARE * normalFrom(noise(key('market', 'all', day))) +
          SECTOR_SHARE * normalFrom(noise(key('sector', security.sector, day))) +
          OWN_SHARE * normalFrom(own)) +
      jumpFrom(own, security.dailyVol) +
      drift +
      SEASON_SIZE * season +
      TREND_PULL * (price / trend - 1);

    points.push({ at, price: Math.max(1, Math.round(price)) });
    price /= 1 + Math.max(move, LARGEST_DAILY_FALL);
    trend /= 1 + drift;
  }
  return points.reverse();
}
