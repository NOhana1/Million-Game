// The player's account and order lifecycle. Every function returns new data and changes nothing.
// There is deliberately no way to cancel an order.

import { executionFor, type Execution, type Market } from './calendar.ts';
import {
  type Agorot,
  FX_SCALE,
  type FxRate,
  percentOf,
  type Price,
  type Units,
  unitsFor,
  valueOf,
} from './money.ts';

export const START_CASH: Agorot = 100_000_000; // ₪1,000,000
export const MAX_POSITION_PERCENT = 20;

export type Side = 'buy' | 'sell';
export type Security = { id: string; market: Market };

/** A price, plus the shekel rate for its currency (1.0000 for Tel Aviv securities). */
export type Quote = { price: Price; fx: FxRate };
export type QuoteSource = (securityId: string) => Quote;

export type Fill = { units: Units; price: Price; fx: FxRate; value: Agorot; at: number };

export type Order = {
  id: string;
  securityId: string;
  side: Side;
  amount: Agorot;
  placedAt: number;
  execution: Execution;
  status: 'pending' | 'filled';
  fill?: Fill;
};

export type Account = {
  cash: Agorot; // available to spend; pending buys are already taken out
  holdings: Record<string, Units>;
  orders: Order[];
};

export type OrderProblem =
  | 'INVALID_AMOUNT'
  | 'DUPLICATE_ORDER'
  | 'INSUFFICIENT_CASH'
  | 'POSITION_LIMIT'
  | 'INSUFFICIENT_HOLDING';

export type OrderRequest = {
  id: string;
  security: Security;
  side: Side;
  amount: Agorot;
  placedAt: number;
};

export type PlaceResult =
  | { ok: true; account: Account; order: Order }
  | { ok: false; problem: OrderProblem };

export const newAccount = (): Account => ({ cash: START_CASH, holdings: {}, orders: [] });

/** Rule 5: US securities convert at the dollar rate; Tel Aviv securities don't convert. */
export const quoteFor = (market: Market, price: Price, usdIls: FxRate): Quote => ({
  price,
  fx: market === 'US' ? usdIls : FX_SCALE,
});

const pendingAmount = (account: Account, side: Side, securityId?: string): Agorot =>
  account.orders
    .filter(
      (o) =>
        o.status === 'pending' &&
        o.side === side &&
        (securityId === undefined || o.securityId === securityId),
    )
    .reduce((sum, o) => sum + o.amount, 0);

export const reservedCash = (account: Account): Agorot => pendingAmount(account, 'buy');

export function holdingValue(account: Account, securityId: string, quotes: QuoteSource): Agorot {
  const units = account.holdings[securityId] ?? 0;
  if (units === 0) return 0;
  const { price, fx } = quotes(securityId);
  return valueOf(units, price, fx);
}

/** Available cash, plus cash held for pending buys, plus holdings at the given quotes. */
export function portfolioValue(account: Account, quotes: QuoteSource): Agorot {
  return Object.keys(account.holdings).reduce(
    (sum, id) => sum + holdingValue(account, id, quotes),
    account.cash + reservedCash(account),
  );
}

function positionRoom(account: Account, securityId: string, quotes: QuoteSource): Agorot {
  const limit = percentOf(portfolioValue(account, quotes), MAX_POSITION_PERCENT);
  const committed =
    holdingValue(account, securityId, quotes) + pendingAmount(account, 'buy', securityId);
  return Math.max(0, limit - committed);
}

function sellableValue(account: Account, securityId: string, quotes: QuoteSource): Agorot {
  const free =
    holdingValue(account, securityId, quotes) - pendingAmount(account, 'sell', securityId);
  return Math.max(0, free);
}

export function maxOrderAmount(
  account: Account,
  securityId: string,
  side: Side,
  quotes: QuoteSource,
): Agorot {
  return side === 'sell'
    ? sellableValue(account, securityId, quotes)
    : Math.min(account.cash, positionRoom(account, securityId, quotes));
}

export function orderProblem(
  account: Account,
  securityId: string,
  side: Side,
  amount: Agorot,
  quotes: QuoteSource,
): OrderProblem | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'INVALID_AMOUNT';
  if (side === 'sell') {
    return amount > sellableValue(account, securityId, quotes) ? 'INSUFFICIENT_HOLDING' : null;
  }
  if (amount > account.cash) return 'INSUFFICIENT_CASH';
  return amount > positionRoom(account, securityId, quotes) ? 'POSITION_LIMIT' : null;
}

/** Accepts an order. A buy takes its cash now, and the price is only known when it fills. */
export function placeOrder(
  account: Account,
  request: OrderRequest,
  quotes: QuoteSource,
): PlaceResult {
  const { id, security, side, amount, placedAt } = request;
  if (account.orders.some((o) => o.id === id)) return { ok: false, problem: 'DUPLICATE_ORDER' };

  const problem = orderProblem(account, security.id, side, amount, quotes);
  if (problem) return { ok: false, problem };

  const order: Order = {
    id,
    securityId: security.id,
    side,
    amount,
    placedAt,
    execution: executionFor(security.market, placedAt),
    status: 'pending',
  };
  return {
    ok: true,
    order,
    account: {
      ...account,
      cash: side === 'buy' ? account.cash - amount : account.cash,
      orders: [...account.orders, order],
    },
  };
}

function withHolding(holdings: Account['holdings'], securityId: string, units: Units) {
  const { [securityId]: _removed, ...others } = holdings;
  return units > 0 ? { ...others, [securityId]: units } : others;
}

/** Fills one order. Filling an order that is already filled changes nothing. */
export function fillOrder(account: Account, orderId: string, quote: Quote): Account {
  const order = account.orders.find((o) => o.id === orderId);
  if (!order) throw new Error(`Unknown order ${orderId}`);
  if (order.status === 'filled') return account;

  const { price, fx } = quote;
  const held = account.holdings[order.securityId] ?? 0;
  const wanted = unitsFor(order.amount, price, fx);
  const units = order.side === 'buy' ? wanted : Math.min(held, wanted);
  const value = order.side === 'buy' ? order.amount : valueOf(units, price, fx);
  const filled: Order = {
    ...order,
    status: 'filled',
    fill: { units, price, fx, value, at: order.execution.at },
  };

  return {
    cash: order.side === 'sell' ? account.cash + value : account.cash,
    holdings: withHolding(
      account.holdings,
      order.securityId,
      order.side === 'buy' ? held + units : held - units,
    ),
    orders: account.orders.map((o) => (o.id === orderId ? filled : o)),
  };
}

/** Fills every pending order due by `now`, by execution time and then in submission order. */
export function settleDueOrders(
  account: Account,
  now: number,
  quoteAtExecution: (order: Order) => Quote,
): Account {
  return account.orders
    .filter((o) => o.status === 'pending' && o.execution.at <= now)
    .sort((a, b) => a.execution.at - b.execution.at)
    .reduce((current, order) => fillOrder(current, order.id, quoteAtExecution(order)), account);
}
