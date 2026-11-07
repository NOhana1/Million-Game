// A player's value over time, rebuilt from their fills and the game's prices. Nothing is stored
// for this, so it reaches back to the first order and adds no database writes.

import { type Account, isMarketOpen, MARKETS, type Order, portfolioValue, START_CASH } from '@portfolio-league/engine';

import type { PriceFeed } from '../market/feed.ts';
import { quotesAt, RANGES, type Range } from '../market/quotes.ts';

const MOST_POINTS = 240;
const SMALLEST_STEP_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Filled = Order & { fill: NonNullable<Order['fill']> };

/** Applies one fill. Pending buys count as cash here, the same as in a player's total value. */
function applied(account: Account, { fill, securityId, side }: Filled): Account {
  const held = account.holdings[securityId] ?? 0;
  const units = side === 'buy' ? held + fill.units : held - fill.units;
  const { [securityId]: _, ...others } = account.holdings;
  return {
    ...account,
    cash: account.cash + (side === 'buy' ? -fill.value : fill.value),
    holdings: units > 0 ? { ...others, [securityId]: units } : others,
  };
}

export function portfolioHistory(
  feed: PriceFeed,
  orders: readonly Order[],
  world: number,
  range: Range,
) {
  const fills = orders
    .filter((order): order is Filled => order.fill !== undefined && order.fill.at <= world)
    .sort((a, b) => a.fill.at - b.fill.at);
  const first = fills[0]?.fill.at;
  if (first === undefined) return { worldTime: world, range, points: [] };

  const from = Math.max(first, world - RANGES[range].days * DAY_MS);
  const stepMs = Math.max(SMALLEST_STEP_MS, Math.ceil((world - from) / MOST_POINTS));
  let account: Account = { cash: START_CASH, holdings: {}, orders: [] };
  let next = 0;

  const valueAt = (at: number) => {
    while (next < fills.length && (fills[next] as Filled).fill.at <= at) {
      account = applied(account, fills[next] as Filled);
      next += 1;
    }
    return portfolioValue(account, quotesAt(feed, at));
  };

  const points: { at: number; price: number }[] = [];
  for (let at = from; at < world; at += stepMs) {
    if (MARKETS.some((market) => isMarketOpen(market, at))) points.push({ at, price: valueAt(at) });
  }
  points.push({ at: world, price: valueAt(world) });
  return { worldTime: world, range, points };
}
