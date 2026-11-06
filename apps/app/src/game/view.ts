// Turns server data into what the screens show. Limit checks use the engine's own rules for
// instant feedback, but the server always makes the final decision.

import {
  type Account,
  AGOROT_PER_SHEKEL,
  dailyRecap,
  FX_SCALE,
  type Market,
  maxOrderAmount as engineMaxOrderAmount,
  type Order,
  orderProblem as engineOrderProblem,
  partsPerMillion,
  PRICE_SCALE,
  quoteFor,
  type Recap,
  type QuoteSource,
  shekelsToAgorot,
  type Side,
  START_CASH,
  UNIT_SCALE,
} from '@portfolio-league/engine';

import type { MarketData, MarketRow, Me, WorldData } from '@/api/client';

export const START_SHEKELS = START_CASH / AGOROT_PER_SHEKEL;

export const MARKET_LABEL: Record<Market, string> = { TASE: 'Tel Aviv', US: 'US' };

const worldTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const formatWorldTime = (ms: number) => worldTimeFormat.format(ms);

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export const formatClock = (ms: number) => clockFormat.format(ms);
export const formatDay = (ms: number) => dayFormat.format(ms);

export function marketsText(world: WorldData) {
  const { TASE, US } = world.markets;
  if (TASE.open && US.open) return 'Both markets open';
  if (!TASE.open && !US.open) return 'Both markets closed';
  return `${MARKET_LABEL[TASE.open ? 'TASE' : 'US']} open`;
}

/** What happens next on the world clock, such as "Tel Aviv closes" or "US opens". */
export function nextEvent(world: WorldData) {
  const at = Math.min(world.markets.TASE.nextChange, world.markets.US.nextChange);
  const events = (['TASE', 'US'] as const)
    .filter((market) => world.markets[market].nextChange === at)
    .map((market) => `${MARKET_LABEL[market]} ${world.markets[market].open ? 'closes' : 'opens'}`);
  return { at, text: events.join(' and ') };
}

export const toShekels = (agorot: number) => agorot / AGOROT_PER_SHEKEL;
export const toUnits = (units: number) => units / UNIT_SCALE;
export const displayPrice = (price: number) => price / PRICE_SCALE;
export const displayFx = (fx: number) => fx / FX_SCALE;
export const orderAmount = (order: Order) => toShekels(order.fill?.value ?? order.amount);
export const orderRefund = (order: Order) => toShekels(order.fill?.refund ?? 0);
export const findRow = (market: MarketData, id: string) =>
  market.securities.find((row) => row.id === id);

const account = (me: Me): Account => ({
  cash: me.cash,
  holdings: me.holdings,
  orders: me.pendingOrders,
});

function quotes(market: MarketData, dayAgo = false): QuoteSource {
  return (id) => {
    const row = findRow(market, id);
    if (!row) throw new Error(`Unknown security ${id}`);
    if (!dayAgo) return quoteFor(row.market, row.price, market.usdIls);
    return quoteFor(row.market, row.priceDayAgo, market.usdIlsDayAgo ?? market.usdIls);
  };
}

export const ppmToPercent = (ppm: number) => ppm / 10_000;

export const recapFor = (me: Me, market: MarketData, orders: Order[]): Recap =>
  dailyRecap({
    now: market.worldTime,
    value: me.value,
    holdings: me.holdings,
    orders,
    quotes: quotes(market),
    quotesDayAgo: quotes(market, true),
  });

const change = (now: number, before: number) => partsPerMillion(now - before, before);

/** The two broad index funds stand in for each market. */
export function marketMoves(market: MarketData) {
  const fund = (label: string, id: string) => {
    const row = findRow(market, id);
    return row ? [{ label, ppm: change(row.price, row.priceDayAgo) }] : [];
  };
  const dollar = market.usdIlsDayAgo
    ? [{ label: 'Dollar', ppm: change(market.usdIls, market.usdIlsDayAgo) }]
    : [];
  return [...fund('Tel Aviv', 'TAIX'), ...fund('US', 'USIX'), ...dollar];
}

export const maxOrderAmount = (me: Me, market: MarketData, row: MarketRow, side: Side) =>
  Math.floor(toShekels(engineMaxOrderAmount(account(me), row.id, side, quotes(market))));

export const canSellAll = (me: Me, id: string) =>
  Boolean(me.holdings[id]) &&
  !me.pendingOrders.some((o) => o.status === 'pending' && o.securityId === id && o.sellAll);

const PROBLEM_TEXT: Record<string, string> = {
  INVALID_AMOUNT: 'Enter an amount.',
  BELOW_MINIMUM: 'The minimum order is ₪100.',
  INSUFFICIENT_HOLDING: 'You can’t sell more than you hold.',
  INSUFFICIENT_CASH: 'You don’t have enough cash.',
  POSITION_LIMIT: 'This would put more than 20% of your portfolio in one security.',
  TOO_MANY_PENDING: 'You have too many orders waiting. Wait for some to fill.',
  ORDER_SETTLING: 'An earlier order is filling right now. Please try again in a moment.',
};

export const problemText = (code: string) =>
  PROBLEM_TEXT[code] ?? 'Something went wrong. Please try again.';

export function orderProblem(
  me: Me,
  market: MarketData,
  row: MarketRow,
  side: Side,
  amount: number,
): string | null {
  const agorot = shekelsToAgorot(amount);
  const problem = engineOrderProblem(account(me), row.id, side, agorot, quotes(market));
  return problem && problemText(problem);
}
