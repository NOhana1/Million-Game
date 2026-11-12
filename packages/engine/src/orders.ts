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
export const MIN_ORDER: Agorot = 10_000; // ₪100

export type Side = 'buy' | 'sell';
export type Security = { id: string; market: Market };

/** A price, plus the shekel rate for its currency (1.0000 for Tel Aviv securities). */
export type Quote = { price: Price; fx: FxRate };
export type QuoteSource = (securityId: string) => Quote;

export type Fill = {
  units: Units;
  price: Price;
  fx: FxRate;
  value: Agorot; // cash spent on a buy, or received from a sale
  refund: Agorot; // part of a buy returned because of the 20% limit
  at: number;
};

export type Order = {
  id: string;
  securityId: string;
  side: Side;
  amount: Agorot; // for a sell-everything order, the estimate at submission
  sellAll?: true;
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
  | 'BELOW_MINIMUM'
  | 'DUPLICATE_ORDER'
  | 'INSUFFICIENT_CASH'
  | 'POSITION_LIMIT'
  | 'INSUFFICIENT_HOLDING';

export type OrderRequest = {
  id: string;
  security: Security;
  side: Side;
  amount: Agorot | 'all'; // 'all' sells the whole holding
  placedAt: number;
};

export type PlaceResult = { ok: true; account: Account; order: Order } | { ok: false; problem: OrderProblem };

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

export const holdsSecurity = (account: Account) => Object.keys(account.holdings).length > 0;

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
  const committed = holdingValue(account, securityId, quotes) + pendingAmount(account, 'buy', securityId);
  return Math.max(0, limit - committed);
}

function sellableValue(account: Account, securityId: string, quotes: QuoteSource): Agorot {
  const free = holdingValue(account, securityId, quotes) - pendingAmount(account, 'sell', securityId);
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
  if (amount < MIN_ORDER) return 'BELOW_MINIMUM';
  if (side === 'sell') {
    return amount > sellableValue(account, securityId, quotes) ? 'INSUFFICIENT_HOLDING' : null;
  }
  if (amount > account.cash) return 'INSUFFICIENT_CASH';
  return amount > positionRoom(account, securityId, quotes) ? 'POSITION_LIMIT' : null;
}

/** Selling everything has no minimum, so a small remainder can always be cleared. */
function sellAllProblem(account: Account, securityId: string, side: Side): OrderProblem | null {
  if (side !== 'sell') return 'INVALID_AMOUNT';
  const alreadySelling = account.orders.some(
    (o) => o.status === 'pending' && o.securityId === securityId && o.sellAll,
  );
  return !account.holdings[securityId] || alreadySelling ? 'INSUFFICIENT_HOLDING' : null;
}

/** Accepts an order. A buy takes its cash now, and the price is only known when it fills. */
export function placeOrder(account: Account, request: OrderRequest, quotes: QuoteSource): PlaceResult {
  const { id, security, side, amount, placedAt } = request;
  if (account.orders.some((o) => o.id === id)) return { ok: false, problem: 'DUPLICATE_ORDER' };

  const sellAll = amount === 'all';
  const problem = sellAll
    ? sellAllProblem(account, security.id, side)
    : orderProblem(account, security.id, side, amount, quotes);
  if (problem) return { ok: false, problem };

  const value = sellAll ? sellableValue(account, security.id, quotes) : amount;
  const order: Order = {
    id,
    securityId: security.id,
    side,
    amount: value,
    ...(sellAll ? { sellAll } : {}),
    placedAt,
    execution: executionFor(security.market, placedAt),
    status: 'pending',
  };
  return {
    ok: true,
    order,
    account: {
      ...account,
      cash: side === 'buy' ? account.cash - value : account.cash,
      orders: [...account.orders, order],
    },
  };
}

function withHolding(holdings: Account['holdings'], securityId: string, units: Units) {
  const { [securityId]: _removed, ...others } = holdings;
  return units > 0 ? { ...others, [securityId]: units } : others;
}

/** Rule 4 at the moment of purchase: how much of a buy fits under the limit at these prices. */
function buyBudget(account: Account, order: Order, quotes: QuoteSource): Agorot {
  const limit = percentOf(portfolioValue(account, quotes), MAX_POSITION_PERCENT);
  const room = limit - holdingValue(account, order.securityId, quotes);
  return Math.max(0, Math.min(order.amount, room));
}

/** Fills one order at the given quotes. Filling an order already filled changes nothing. */
export function fillOrder(account: Account, orderId: string, quotes: QuoteSource): Account {
  const order = account.orders.find((o) => o.id === orderId);
  if (!order) throw new Error(`Unknown order ${orderId}`);
  if (order.status === 'filled') return account;

  const { price, fx } = quotes(order.securityId);
  const held = account.holdings[order.securityId] ?? 0;
  const buying = order.side === 'buy';

  const spent = buying ? buyBudget(account, order, quotes) : 0;
  const wanted = order.sellAll ? held : unitsFor(buying ? spent : order.amount, price, fx);
  const units = buying ? wanted : Math.min(held, wanted);
  const value = buying ? spent : valueOf(units, price, fx);
  const refund = buying ? order.amount - spent : 0;
  const filled: Order = {
    ...order,
    status: 'filled',
    fill: { units, price, fx, value, refund, at: order.execution.at },
  };

  return {
    cash: account.cash + (buying ? refund : value),
    holdings: withHolding(account.holdings, order.securityId, buying ? held + units : held - units),
    orders: account.orders.map((o) => (o.id === orderId ? filled : o)),
  };
}

/** Fills every pending order due by `now`, by execution time and then in submission order. */
export function settleDueOrders(
  account: Account,
  now: number,
  quotesAtExecution: (order: Order) => QuoteSource,
): Account {
  return account.orders
    .filter((o) => o.status === 'pending' && o.execution.at <= now)
    .sort((a, b) => a.execution.at - b.execution.at)
    .reduce((current, order) => fillOrder(current, order.id, quotesAtExecution(order)), account);
}

type Held = { units: Units; cost: number; paid: Agorot }; // cost: units × price; paid: shekels spent

/**
 * A filled sale. `cost` is the shekels paid for the units sold, on the average of the buys before
 * it, at the dollar rate of each buy. It is null when no buy of those units is on record.
 */
export type Sale = { orderId: string; securityId: string; at: number; proceeds: Agorot; cost: Agorot | null };

/**
 * Walks the filled orders in time order and keeps, for each security still held, its units, its cost
 * in its own currency and the shekels actually paid for it (dollar rate included). Selling keeps the
 * average: what's left keeps its share of the cost. Selling everything starts again with the next buy.
 * It also lists every sale with the shekels paid for what was sold.
 */
function walkFills(orders: Order[]): { held: Map<string, Held>; sales: Sale[] } {
  const held = new Map<string, Held>();
  const sales: Sale[] = [];
  const filled = orders
    .filter((o) => o.status === 'filled' && o.fill && o.fill.units > 0)
    .sort((a, b) => a.fill!.at - b.fill!.at || a.placedAt - b.placedAt);
  for (const { id, securityId, side, fill } of filled) {
    const { units, price, value, at } = fill!;
    const now = held.get(securityId) ?? { units: 0, cost: 0, paid: 0 };
    if (side === 'buy') {
      held.set(securityId, {
        units: now.units + units,
        cost: now.cost + units * price,
        paid: now.paid + value,
      });
      continue;
    }
    const sold = Math.min(units, now.units);
    sales.push({
      orderId: id,
      securityId,
      at,
      proceeds: value,
      cost: now.units > 0 && sold === units ? Math.round((now.paid * sold) / now.units) : null,
    });
    const left = Math.max(0, now.units - units);
    if (left === 0) held.delete(securityId);
    else
      held.set(securityId, {
        units: left,
        cost: (now.cost * left) / now.units,
        paid: (now.paid * left) / now.units,
      });
  }
  return { held, sales };
}

const heldBuys = (orders: Order[]) => walkFills(orders).held;

/** Every filled sale, oldest first, with the shekels paid for what was sold. */
export const salesOf = (orders: Order[]): Sale[] => walkFills(orders).sales;

/**
 * Capital gains tax, for display only: the game never takes it from cash. Israel taxes real gains
 * at 25%, and a year's losses offset that year's gains.
 */
export const CAPITAL_GAINS_TAX_PERCENT = 25;

export type TaxYear = {
  year: number;
  sales: number;
  gains: Agorot; // total profit on sales that made money
  losses: Agorot; // total loss on sales that lost money, as a positive number
  net: Agorot; // gains − losses
  tax: Agorot; // 25% of net, or 0 when the year lost money
};

/** Sales grouped by year, newest year first. Sales with an unknown cost are left out. */
export function taxYears(sales: Sale[], yearOf: (at: number) => number): TaxYear[] {
  const years = new Map<number, TaxYear>();
  for (const sale of sales) {
    if (sale.cost === null) continue;
    const year = yearOf(sale.at);
    const entry = years.get(year) ?? { year, sales: 0, gains: 0, losses: 0, net: 0, tax: 0 };
    const profit = sale.proceeds - sale.cost;
    entry.sales += 1;
    if (profit > 0) entry.gains += profit;
    else entry.losses -= profit;
    entry.net = entry.gains - entry.losses;
    entry.tax = Math.max(0, Math.round((entry.net * CAPITAL_GAINS_TAX_PERCENT) / 100));
    years.set(year, entry);
  }
  return [...years.values()].sort((a, b) => b.year - a.year);
}

/**
 * What the player paid per unit, on average, for what they hold now, in the security's own
 * currency. Selling keeps the average; selling everything starts it again with the next buy.
 */
export function averageBuyPrices(orders: Order[]): Record<string, Price> {
  return Object.fromEntries(
    [...heldBuys(orders)].map(([securityId, { units, cost }]) => [securityId, Math.round(cost / units)]),
  );
}

/**
 * The shekels the player paid for what they hold now, at the dollar rate of each buy, on the same
 * average as averageBuyPrices. Its value now minus this is the profit since buying, in shekels.
 */
export function paidForHoldings(orders: Order[]): Record<string, Agorot> {
  return Object.fromEntries(
    [...heldBuys(orders)].map(([securityId, { paid }]) => [securityId, Math.round(paid)]),
  );
}
