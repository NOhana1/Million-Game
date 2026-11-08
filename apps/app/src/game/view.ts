// Turns server data into what the screens show. Limit checks use the engine's own rules for
// instant feedback, but the server always makes the final decision.

import {
  type Account,
  AGOROT_PER_SHEKEL,
  dailyRecap,
  type Division,
  FX_SCALE,
  INDEX_FUNDS,
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

import type { MarketData, MarketRow, Me, Range, WorldData } from '@/api/client';

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

export const dayChange = (row: MarketRow) => (row.price / row.priceDayAgo - 1) * 100;

const dateFormat = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', ...options });

const AXIS_DATES: Record<Range, Intl.DateTimeFormat> = {
  '1D': dateFormat({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  '1W': dateFormat({ weekday: 'short', day: 'numeric' }),
  '1M': dateFormat({ day: 'numeric', month: 'short' }),
  '3M': dateFormat({ day: 'numeric', month: 'short' }),
  '6M': dateFormat({ month: 'short', year: '2-digit' }),
  '1Y': dateFormat({ month: 'short', year: '2-digit' }),
  '5Y': dateFormat({ year: 'numeric' }),
  ALL: dateFormat({ year: 'numeric' }),
};

const SCRUB_DATE = dateFormat({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const SCRUB_TIME = dateFormat({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const axisDate = (ms: number, range: Range) => AXIS_DATES[range].format(ms);
/** The moment under the pointer. Long ranges hold one price a day, so they show no time. */
export const scrubDate = (ms: number, range: Range) =>
  (range === '1D' || range === '1W' || range === '1M' ? SCRUB_TIME : SCRUB_DATE).format(ms);

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

/** Each index fund's move over the last day, in shekels, to compare with a portfolio. */
export function indexFunds(market: MarketData) {
  const now = quotes(market);
  const before = quotes(market, true);
  const worth = (source: QuoteSource, id: string) => source(id).price * source(id).fx;
  return INDEX_FUNDS.flatMap((id) => {
    const row = findRow(market, id);
    return row ? [{ id, name: row.name, dayPpm: change(worth(now, id), worth(before, id)) }] : [];
  });
}

export const DIVISION_LABEL: Record<Division, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  diamond: 'Diamond',
};

/** How far along the way from the starting cash to the goal, from 0 to 100. */
export function goalProgress(value: number, goal: number) {
  const part = goal > START_CASH ? (value - START_CASH) / (goal - START_CASH) : value / goal;
  return Math.min(100, Math.max(0, part * 100));
}

const MINUTE_MS = 60_000;

/** Real time left in the week, which depends on how fast the clock is running. */
export function weekEndsIn(world: WorldData, weekEndsAt: number, now: number) {
  if (world.clock.paused) return 'The clock is stopped';
  const minutes = Math.ceil((weekEndsAt - now) / world.clock.speed / MINUTE_MS);
  if (minutes <= 0) return 'The week is closing';
  const hours = Math.floor(minutes / 60);
  return `Week ends in ${hours > 0 ? `${hours}h ` : ''}${minutes % 60}m`;
}

export const maxOrderAmount = (me: Me, market: MarketData, row: MarketRow, side: Side) =>
  Math.floor(toShekels(engineMaxOrderAmount(account(me), row.id, side, quotes(market))));

export const canSellAll = (me: Me, id: string) =>
  Boolean(me.holdings[id]) &&
  !me.pendingOrders.some((o) => o.status === 'pending' && o.securityId === id && o.sellAll);

/**
 * An order whose time has come but which hasn't gone through yet. It takes up to a minute.
 * New orders wait for it, because the cash and holdings change when it does.
 */
export const fillingOrder = (me: Me, worldTime: number) =>
  me.pendingOrders.find((order) => order.status === 'pending' && order.execution.at <= worldTime);

const PROBLEM_TEXT: Record<string, string> = {
  INVALID_AMOUNT: 'Enter an amount.',
  BELOW_MINIMUM: 'The minimum order is ₪100.',
  INSUFFICIENT_HOLDING: 'You can’t sell more than you hold.',
  INSUFFICIENT_CASH: 'You don’t have enough cash.',
  POSITION_LIMIT: 'This would put more than 20% of your portfolio in one security.',
  TOO_MANY_PENDING: 'You have too many orders waiting. Wait for some to fill.',
  ORDER_SETTLING: 'Your last order is going through right now. You can trade again in about a minute.',
  TRADING_PAUSED: 'Trading is paused for a short while. Your orders and money are safe.',
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
