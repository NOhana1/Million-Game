// The daily recap: what happened to a player's portfolio over the last game day. It only
// describes the past, so it adds no rules and needs nothing stored.

import { type Agorot, partsPerMillion, valueOf } from './money.ts';
import type { Fill, Order, QuoteSource } from './orders.ts';

export const RECAP_WINDOW_MS = 24 * 60 * 60 * 1000;

export type RecapPosition = {
  securityId: string;
  value: Agorot;
  change: Agorot;
  changePpm: number;
};

export type RecapFill = Pick<Order, 'securityId' | 'side'> & { fill: Fill };

export type Recap = {
  change: Agorot; // what today's holdings gained or lost
  changePpm: number; // as a share of the whole portfolio, including cash
  best: RecapPosition | null;
  worst: RecapPosition | null; // null with fewer than two holdings
  fills: RecapFill[]; // newest first
};

export type RecapInput = {
  now: number;
  value: Agorot; // the whole portfolio now
  holdings: Record<string, number>;
  orders: readonly Order[];
  quotes: QuoteSource;
  quotesDayAgo: QuoteSource;
};

function position(id: string, units: number, input: RecapInput): RecapPosition {
  const now = input.quotes(id);
  const before = input.quotesDayAgo(id);
  const value = valueOf(units, now.price, now.fx);
  const previous = valueOf(units, before.price, before.fx);
  const change = value - previous;
  return {
    securityId: id,
    value,
    change,
    changePpm: previous === 0 ? 0 : partsPerMillion(change, previous),
  };
}

/** Measures the units held now, so a holding bought today counts for the whole day. */
export function dailyRecap(input: RecapInput): Recap {
  const positions = Object.entries(input.holdings)
    .map(([id, units]) => position(id, units, input))
    .sort((a, b) => b.changePpm - a.changePpm || a.securityId.localeCompare(b.securityId));

  const change = positions.reduce((sum, p) => sum + p.change, 0);
  const previousValue = input.value - change;
  const since = input.now - RECAP_WINDOW_MS;

  const fills = input.orders
    .flatMap(({ securityId, side, fill }) => (fill ? [{ securityId, side, fill }] : []))
    .filter(({ fill }) => fill.at > since && fill.at <= input.now)
    .sort((a, b) => b.fill.at - a.fill.at);

  return {
    change,
    changePpm: previousValue <= 0 ? 0 : partsPerMillion(change, previousValue),
    best: positions[0] ?? null,
    worst: positions.length > 1 ? (positions.at(-1) ?? null) : null,
    fills,
  };
}
