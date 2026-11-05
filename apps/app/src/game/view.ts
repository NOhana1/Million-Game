// Turns server data into what the screens show. Limit checks use the engine's own rules for
// instant feedback, but the server always makes the final decision.

import {
  type Account,
  AGOROT_PER_SHEKEL,
  FX_SCALE,
  type Market,
  maxOrderAmount as engineMaxOrderAmount,
  type Order,
  orderProblem as engineOrderProblem,
  PRICE_SCALE,
  quoteFor,
  type QuoteSource,
  shekelsToAgorot,
  type Side,
  START_CASH,
  UNIT_SCALE,
} from '@portfolio-league/engine';

import type { MarketData, MarketRow, Me } from '@/api/client';

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

function quotes(market: MarketData): QuoteSource {
  return (id) => {
    const row = findRow(market, id);
    if (!row) throw new Error(`Unknown security ${id}`);
    return quoteFor(row.market, row.price, market.usdIls);
  };
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
