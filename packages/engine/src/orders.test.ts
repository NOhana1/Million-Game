import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as engine from './index.ts';
import {
  type Account,
  fillOrder,
  FX_SCALE,
  holdingValue,
  holdsSecurity,
  maxOrderAmount,
  MIN_ORDER,
  newAccount,
  orderProblem,
  type OrderRequest,
  placeOrder,
  portfolioValue,
  type Quote,
  quoteFor,
  type QuoteSource,
  reservedCash,
  settleDueOrders,
  type Side,
  START_CASH,
} from './index.ts';

const utc = (iso: string) => Date.parse(`${iso}Z`);
const IN_SESSION = utc('2026-11-09T10:00:00'); // Tel Aviv open, US closed
const TEN: Quote = { price: 100_000, fx: FX_SCALE };
const tenEach: QuoteSource = () => TEN;

const tase = { id: 'TASE1', market: 'TASE' } as const;
const us = { id: 'US1', market: 'US' } as const;

let nextId = 0;

function request(side: Side, amount: number, security: OrderRequest['security'] = tase) {
  nextId += 1;
  return { id: `order-${nextId}`, security, side, amount, placedAt: IN_SESSION };
}

function place(account: Account, req: OrderRequest, quotes = tenEach) {
  const result = placeOrder(account, req, quotes);
  assert.ok(result.ok, `expected order to be accepted: ${JSON.stringify(result)}`);
  return result;
}

function holdingOf(amount: number) {
  const { account, order } = place(newAccount(), request('buy', amount));
  return fillOrder(account, order.id, tenEach);
}

describe('rule 1: starting cash', () => {
  it('starts with ₪1,000,000 and nothing else', () => {
    assert.deepEqual(newAccount(), { cash: START_CASH, holdings: {}, orders: [] });
    assert.equal(START_CASH, 100_000_000);
  });
});

describe('rule 2: orders by shekel amount, fractional units', () => {
  it('buys a fraction of a unit', () => {
    const account = holdingOf(15_500); // ₪155 at ₪10
    assert.equal(account.holdings.TASE1, 15_500_000);
  });

  it('rejects amounts that are not a positive whole number of agorot', () => {
    for (const amount of [0, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = placeOrder(newAccount(), request('buy', amount), tenEach);
      assert.deepEqual(result, { ok: false, problem: 'INVALID_AMOUNT' });
    }
  });
});

describe('rule 3: execution timing', () => {
  it('records a close execution when the market is open', () => {
    const { order } = place(newAccount(), request('buy', 100_000));
    assert.deepEqual(order.execution, { kind: 'close', at: utc('2026-11-09T15:30:00') });
  });

  it('records an open execution when the market is closed', () => {
    const { order } = place(newAccount(), request('buy', 100_000, us));
    assert.deepEqual(order.execution, { kind: 'open', at: utc('2026-11-09T14:30:00') });
  });

  it('leaves the order pending with no price until it fills', () => {
    const { order } = place(newAccount(), request('buy', 100_000));
    assert.equal(order.status, 'pending');
    assert.equal(order.fill, undefined);
  });

  it('fills at the price given at execution, not the price at submission', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const filled = fillOrder(account, order.id, () => ({ price: 200_000, fx: FX_SCALE }));
    assert.equal(filled.holdings.TASE1, 50_000_000); // ₪1,000 at ₪20
    assert.equal(filled.orders[0]?.fill?.price, 200_000);
  });

  it('stamps the fill with the execution time', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const filled = fillOrder(account, order.id, tenEach);
    assert.equal(filled.orders[0]?.fill?.at, order.execution.at);
  });

  it('offers no way to cancel an order', () => {
    const names = Object.keys(engine).filter((name) => /cancel/i.test(name));
    assert.deepEqual(names, []);
  });
});

describe('settleDueOrders', () => {
  it('leaves orders that are not due', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const settled = settleDueOrders(account, order.execution.at - 1, () => tenEach);
    assert.equal(settled, account);
  });

  it('fills an order exactly at its execution time', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const settled = settleDueOrders(account, order.execution.at, () => tenEach);
    assert.equal(settled.orders[0]?.status, 'filled');
  });

  it('handles a long jump, in execution order, with each order’s own price', () => {
    const first = place(newAccount(), request('buy', 100_000, us)); // US open, 14:30
    const second = place(first.account, request('buy', 100_000)); // Tel Aviv close, 15:30
    const order = second.account.orders;
    const seen: string[] = [];
    const settled = settleDueOrders(second.account, utc('2026-11-20T00:00:00'), (o) => {
      seen.push(o.id);
      return (id) => (id === 'US1' ? { price: 100_000, fx: 30_000 } : TEN);
    });
    assert.deepEqual(seen, [order[0]?.id, order[1]?.id]);
    assert.equal(settled.holdings.US1, 33_333_333); // ₪1,000 at $10 x 3.0
    assert.equal(settled.holdings.TASE1, 100_000_000); // ₪1,000 at ₪10
  });

  it('fills orders for the same moment in submission order', () => {
    const start = holdingOf(100_000);
    const a = place(start, request('sell', 70_000));
    const b = place(a.account, request('sell', 30_000));
    const settled = settleDueOrders(b.account, utc('2026-11-10T00:00:00'), () => () => ({
      price: 50_000,
      fx: FX_SCALE,
    }));
    // At ₪5, the first sale wants 140 units but only 100 are held, so the second gets none.
    assert.equal(settled.orders[1]?.fill?.units, 100_000_000);
    assert.equal(settled.orders[2]?.fill?.units, 0);
  });

  it('is safe to run twice', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const once = settleDueOrders(account, order.execution.at, () => tenEach);
    const twice = settleDueOrders(once, order.execution.at, () => () => ({ price: 1, fx: 1 }));
    assert.deepEqual(twice, once);
  });
});

describe('fillOrder', () => {
  it('changes nothing for an order that is already filled', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const filled = fillOrder(account, order.id, tenEach);
    assert.equal(fillOrder(filled, order.id, () => ({ price: 1, fx: 1 })), filled);
  });

  it('throws for an unknown order', () => {
    assert.throws(() => fillOrder(newAccount(), 'missing', tenEach));
  });

  it('never changes the account it receives', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const before = structuredClone(account);
    fillOrder(account, order.id, tenEach);
    assert.deepEqual(account, before);
  });
});

describe('rule 4: no leverage', () => {
  it('takes the cash for a buy when the order is placed', () => {
    const { account } = place(newAccount(), request('buy', 100_000));
    assert.equal(account.cash, START_CASH - 100_000);
    assert.equal(reservedCash(account), 100_000);
  });

  it('spends exactly the order amount, whatever the fill price', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const filled = fillOrder(account, order.id, () => ({ price: 7_777, fx: FX_SCALE }));
    assert.equal(filled.cash, START_CASH - 100_000);
    assert.equal(reservedCash(filled), 0);
    assert.equal(filled.orders[0]?.fill?.value, 100_000);
  });

  it('rejects a buy above available cash', () => {
    const poor: Account = { cash: 10_000, holdings: {}, orders: [] };
    const result = placeOrder(poor, request('buy', 10_001), tenEach);
    assert.deepEqual(result, { ok: false, problem: 'INSUFFICIENT_CASH' });
  });

  it('counts cash already held by pending buys', () => {
    const { account } = place(newAccount(), request('buy', 20_000_000));
    const spent = { ...account, cash: 10_000 };
    assert.equal(orderProblem(spent, 'OTHER', 'buy', 10_001, tenEach), 'INSUFFICIENT_CASH');
  });

  it('does not let pending sale proceeds fund a buy', () => {
    const account: Account = { cash: 0, holdings: { TASE1: 50_000_000 }, orders: [] };
    const selling = place(account, request('sell', 50_000));
    const problem = orderProblem(selling.account, 'OTHER', 'buy', 10_000, tenEach);
    assert.equal(problem, 'INSUFFICIENT_CASH');
  });
});

describe('rule 4: no short selling', () => {
  it('rejects a sale with no holding', () => {
    const result = placeOrder(newAccount(), request('sell', 10_000), tenEach);
    assert.deepEqual(result, { ok: false, problem: 'INSUFFICIENT_HOLDING' });
  });

  it('rejects a sale above the holding value', () => {
    const account = holdingOf(100_000);
    assert.equal(orderProblem(account, 'TASE1', 'sell', 100_001, tenEach), 'INSUFFICIENT_HOLDING');
  });

  it('counts pending sells against the holding', () => {
    const account = holdingOf(100_000);
    const { account: selling } = place(account, request('sell', 60_000));
    assert.equal(orderProblem(selling, 'TASE1', 'sell', 40_001, tenEach), 'INSUFFICIENT_HOLDING');
    assert.equal(orderProblem(selling, 'TASE1', 'sell', 40_000, tenEach), null);
  });

  it('does not sell pending buys that have not filled', () => {
    const { account } = place(newAccount(), request('buy', 100_000));
    assert.equal(orderProblem(account, 'TASE1', 'sell', 10_000, tenEach), 'INSUFFICIENT_HOLDING');
  });

  it('adds sale proceeds to cash only when the order fills', () => {
    const start = holdingOf(100_000);
    const { account, order } = place(start, request('sell', 40_000));
    assert.equal(account.cash, start.cash);
    const filled = fillOrder(account, order.id, tenEach);
    assert.equal(filled.cash, start.cash + 40_000);
    assert.equal(filled.holdings.TASE1, 60_000_000);
  });

  it('sells the holding at most when the price has fallen', () => {
    const start = holdingOf(100_000); // 100 units
    const { account, order } = place(start, request('sell', 100_000));
    const filled = fillOrder(account, order.id, () => ({ price: 50_000, fx: FX_SCALE }));
    assert.equal(filled.orders[1]?.fill?.units, 100_000_000);
    assert.equal(filled.orders[1]?.fill?.value, 50_000);
    assert.equal(filled.holdings.TASE1, undefined);
  });

  it('sells fewer units when the price has risen', () => {
    const start = holdingOf(100_000);
    const { account, order } = place(start, request('sell', 100_000));
    const filled = fillOrder(account, order.id, () => ({ price: 200_000, fx: FX_SCALE }));
    assert.equal(filled.holdings.TASE1, 50_000_000);
    assert.equal(filled.orders[1]?.fill?.value, 100_000);
  });

  it('removes a holding that reaches zero', () => {
    const start = holdingOf(100_000);
    const { account, order } = place(start, request('sell', 100_000));
    assert.deepEqual(fillOrder(account, order.id, tenEach).holdings, {});
  });
});

describe('rule 4: 20% position limit at submission', () => {
  const limit = 20_000_000; // 20% of ₪1,000,000

  it('allows exactly 20%', () => {
    assert.equal(orderProblem(newAccount(), 'A', 'buy', limit, tenEach), null);
  });

  it('rejects one agora more', () => {
    assert.equal(orderProblem(newAccount(), 'A', 'buy', limit + 1, tenEach), 'POSITION_LIMIT');
  });

  it('counts the current holding', () => {
    const account = holdingOf(15_000_000);
    assert.equal(maxOrderAmount(account, 'TASE1', 'buy', tenEach), 5_000_000);
  });

  it('counts pending buys, so several orders can’t pass it one by one', () => {
    const { account } = place(newAccount(), request('buy', limit));
    assert.equal(orderProblem(account, 'TASE1', 'buy', 10_000, tenEach), 'POSITION_LIMIT');
  });

  it('applies to each security separately', () => {
    const { account } = place(newAccount(), request('buy', limit));
    assert.equal(orderProblem(account, 'OTHER', 'buy', limit, tenEach), null);
  });

  it('values the portfolio including held cash and holdings', () => {
    const account = holdingOf(10_000_000);
    const doubled: QuoteSource = () => ({ price: 200_000, fx: FX_SCALE });
    // ₪900,000 cash plus ₪200,000 of holdings: the limit is ₪220,000, ₪20,000 of room.
    assert.equal(maxOrderAmount(account, 'TASE1', 'buy', doubled), 2_000_000);
  });

  it('blocks adding to a position that drifted above the limit, without forcing a sale', () => {
    const account = holdingOf(20_000_000);
    const surged: QuoteSource = () => ({ price: 300_000, fx: FX_SCALE });
    assert.equal(maxOrderAmount(account, 'TASE1', 'buy', surged), 0);
    assert.equal(holdingValue(account, 'TASE1', surged), 60_000_000);
  });

  it('caps the maximum buy at available cash', () => {
    const poor: Account = { cash: 1_000, holdings: { X: 100_000_000 }, orders: [] };
    assert.equal(maxOrderAmount(poor, 'A', 'buy', tenEach), 1_000);
  });
});

describe('rule 5: US securities', () => {
  it('uses the dollar rate for US securities only', () => {
    assert.deepEqual(quoteFor('US', 100_000, 34_200), { price: 100_000, fx: 34_200 });
    assert.deepEqual(quoteFor('TASE', 100_000, 34_200), { price: 100_000, fx: FX_SCALE });
  });

  it('converts a buy at the rate at execution', () => {
    const { account, order } = place(newAccount(), request('buy', 34_200, us));
    const filled = fillOrder(account, order.id, () => ({ price: 100_000, fx: 34_200 }));
    assert.equal(filled.holdings.US1, 10_000_000);
    assert.equal(filled.orders[0]?.fill?.fx, 34_200);
  });

  it('converts a sale back to shekels at the rate at execution', () => {
    const start: Account = { cash: 0, holdings: { US1: 10_000_000 }, orders: [] };
    const quotes: QuoteSource = () => ({ price: 100_000, fx: 34_200 });
    const { account, order } = place(start, request('sell', 30_000, us), quotes);
    const filled = fillOrder(account, order.id, () => ({ price: 100_000, fx: 30_000 }));
    assert.equal(filled.cash, 30_000);
    assert.equal(filled.holdings.US1, undefined);
  });

  it('values holdings at the current rate', () => {
    const account: Account = { cash: 0, holdings: { US1: 1_000_000 }, orders: [] };
    assert.equal(portfolioValue(account, () => ({ price: 100_000, fx: 34_200 })), 3_420);
    assert.equal(portfolioValue(account, () => ({ price: 100_000, fx: 30_000 })), 3_000);
  });
});

describe('portfolioValue', () => {
  it('includes cash held for pending buys', () => {
    const { account } = place(newAccount(), request('buy', 100_000));
    assert.equal(portfolioValue(account, tenEach), START_CASH);
  });

  it('keeps pending sells in holdings until they fill', () => {
    const start = holdingOf(100_000);
    const { account } = place(start, request('sell', 100_000));
    assert.equal(portfolioValue(account, tenEach), START_CASH);
  });
});

describe('placeOrder', () => {
  it('rejects a repeated order id, so a double tap charges once', () => {
    const req = request('buy', 100_000);
    const { account } = place(newAccount(), req);
    assert.deepEqual(placeOrder(account, req, tenEach), { ok: false, problem: 'DUPLICATE_ORDER' });
    assert.equal(account.orders.length, 1);
  });

  it('never changes the account it receives', () => {
    const account = newAccount();
    const before = structuredClone(account);
    place(account, request('buy', 100_000));
    assert.deepEqual(account, before);
  });
});

describe('rule 4: 20% limit at the moment of purchase', () => {
  const limit = 20_000_000;

  it('fills in full when the order still fits', () => {
    const { account, order } = place(newAccount(), request('buy', limit));
    const filled = fillOrder(account, order.id, tenEach);
    assert.equal(filled.orders[0]?.fill?.value, limit);
    assert.equal(filled.orders[0]?.fill?.refund, 0);
  });

  it('fills up to the limit and returns the rest when the portfolio fell', () => {
    // ₪200,000 of A is pending, and B has dropped from ₪800,000 to ₪700,000.
    const start: Account = { cash: 20_000_000, holdings: { B: 80_000_000_000 }, orders: [] };
    const quotes: QuoteSource = (id) => (id === 'B' ? { price: 100_000, fx: FX_SCALE } : TEN);
    const { account, order } = place(start, request('buy', 20_000_000), quotes);
    const dropped: QuoteSource = (id) => (id === 'B' ? { price: 87_500, fx: FX_SCALE } : TEN);

    const filled = fillOrder(account, order.id, dropped);

    assert.equal(filled.orders[0]?.fill?.value, 18_000_000); // 20% of ₪900,000
    assert.equal(filled.orders[0]?.fill?.refund, 2_000_000);
    assert.equal(filled.cash, 2_000_000);
    assert.equal(filled.holdings.TASE1, 18_000_000_000); // ₪180,000 at ₪10
    assert.equal(reservedCash(filled), 0);
  });

  it('counts the holding at the execution price', () => {
    const start = holdingOf(15_000_000); // ₪150,000 at ₪10
    const { account, order } = place(start, request('buy', 5_000_000));
    const risen: QuoteSource = () => ({ price: 120_000, fx: FX_SCALE });
    const filled = fillOrder(account, order.id, risen);
    // Worth ₪1,030,000 at fill, so the limit is ₪206,000. The holding is ₪180,000.
    assert.equal(filled.orders[1]?.fill?.value, 2_600_000);
    assert.equal(filled.orders[1]?.fill?.refund, 2_400_000);
  });

  it('returns everything, with 0 units, when there is no room left', () => {
    const start = holdingOf(15_000_000);
    const { account, order } = place(start, request('buy', 5_000_000));
    const surged: QuoteSource = () => ({ price: 300_000, fx: FX_SCALE });
    const filled = fillOrder(account, order.id, surged);
    assert.equal(filled.orders[1]?.fill?.units, 0);
    assert.equal(filled.orders[1]?.fill?.refund, 5_000_000);
    assert.equal(filled.cash, START_CASH - 15_000_000);
  });

  it('applies to orders filling together, one after the other', () => {
    const first = place(newAccount(), request('buy', 12_000_000));
    const second = place(first.account, request('buy', 8_000_000));
    const third: Account = { ...second.account, cash: 0 };
    const settled = settleDueOrders(third, utc('2026-11-10T00:00:00'), () => () => ({
      price: 100_000,
      fx: FX_SCALE,
    }));
    // Removing the free cash shrinks the portfolio to ₪200,000, so the limit is ₪40,000.
    assert.equal(settled.orders[0]?.fill?.value, 4_000_000);
    assert.equal(settled.orders[1]?.fill?.value, 0);
    assert.equal(settled.orders[0]?.fill?.refund, 8_000_000);
    assert.equal(settled.orders[1]?.fill?.refund, 8_000_000);
  });

  it('does not apply to sales', () => {
    const start = holdingOf(20_000_000);
    const { account, order } = place(start, request('sell', 10_000_000));
    const surged: QuoteSource = () => ({ price: 300_000, fx: FX_SCALE });
    assert.equal(fillOrder(account, order.id, surged).orders[1]?.fill?.refund, 0);
  });
});

describe('sell everything', () => {
  const sellAll = () => ({ ...request('sell', 0), amount: 'all' as const });

  it('sells every unit whatever the price', () => {
    const start = holdingOf(100_000);
    const { account, order } = place(start, sellAll());
    assert.equal(order.sellAll, true);
    assert.equal(order.amount, 100_000);
    const filled = fillOrder(account, order.id, () => ({ price: 123_456, fx: FX_SCALE }));
    assert.deepEqual(filled.holdings, {});
    assert.equal(filled.orders[1]?.fill?.units, 100_000_000);
    assert.equal(filled.orders[1]?.fill?.value, 123_456);
  });

  it('clears a remainder below the minimum order', () => {
    const start: Account = { cash: 0, holdings: { TASE1: 1_234 }, orders: [] };
    const { account, order } = place(start, sellAll());
    assert.deepEqual(fillOrder(account, order.id, tenEach).holdings, {});
  });

  it('sells only what is left after an earlier pending sale', () => {
    const start = holdingOf(100_000);
    const first = place(start, request('sell', 40_000));
    const second = place(first.account, sellAll());
    assert.equal(second.order.amount, 60_000);
    const settled = settleDueOrders(second.account, utc('2026-11-10T00:00:00'), () => tenEach);
    assert.deepEqual(settled.holdings, {});
    assert.equal(settled.cash, start.cash + 100_000);
  });

  it('rejects it with no holding', () => {
    const result = placeOrder(newAccount(), sellAll(), tenEach);
    assert.deepEqual(result, { ok: false, problem: 'INSUFFICIENT_HOLDING' });
  });

  it('rejects a second one while the first is pending', () => {
    const { account } = place(holdingOf(100_000), sellAll());
    const result = placeOrder(account, sellAll(), tenEach);
    assert.deepEqual(result, { ok: false, problem: 'INSUFFICIENT_HOLDING' });
  });

  it('counts against the amount left to sell', () => {
    const { account } = place(holdingOf(100_000), sellAll());
    assert.equal(maxOrderAmount(account, 'TASE1', 'sell', tenEach), 0);
  });

  it('can’t be used to buy', () => {
    const req = { ...request('buy', 0), amount: 'all' as const };
    assert.deepEqual(placeOrder(newAccount(), req, tenEach), {
      ok: false,
      problem: 'INVALID_AMOUNT',
    });
  });
});

describe('minimum order', () => {
  it('accepts exactly ₪100', () => {
    assert.equal(orderProblem(newAccount(), 'A', 'buy', MIN_ORDER, tenEach), null);
    assert.equal(MIN_ORDER, 10_000);
  });

  it('rejects one agora less, for buys and sales', () => {
    assert.equal(orderProblem(newAccount(), 'A', 'buy', 9_999, tenEach), 'BELOW_MINIMUM');
    const account = holdingOf(100_000);
    assert.equal(orderProblem(account, 'TASE1', 'sell', 9_999, tenEach), 'BELOW_MINIMUM');
  });
});

describe('holdsSecurity', () => {
  it('is true only once a position has filled', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    assert.equal(holdsSecurity(account), false);
    assert.equal(holdsSecurity(fillOrder(account, order.id, tenEach)), true);
  });
});

describe('invariants across random play', () => {
  it('never allows negative cash or holdings, and conserves money at constant prices', () => {
    let seed = 42;
    const random = (limit: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % limit;
    };
    const ids = ['TASE1', 'TASE2', 'US1'];
    const security = (id: string) => ({ id, market: id === 'US1' ? 'US' : 'TASE' }) as const;
    const quotes: QuoteSource = (id) => quoteFor(security(id).market, 197_300, 34_217);

    let account = newAccount();
    let now = IN_SESSION;
    for (let step = 0; step < 2_000; step += 1) {
      const id = ids[random(ids.length)] ?? 'TASE1';
      const side: Side = random(2) === 0 ? 'buy' : 'sell';
      const amount = 10_000 + random(30_000_000);
      const result = placeOrder(
        account,
        { id: `random-${step}`, security: security(id), side, amount, placedAt: now },
        quotes,
      );
      if (result.ok) account = result.account;

      now += 3_600_000;
      const before = portfolioValue(account, quotes);
      account = settleDueOrders(account, now, () => quotes);
      const after = portfolioValue(account, quotes);

      assert.ok(account.cash >= 0);
      assert.ok(Object.values(account.holdings).every((units) => units > 0));
      assert.ok(after <= before, 'rounding must never create money');
      assert.ok(before - after <= 10 * account.orders.length + 10, 'rounding loss stays tiny');
    }
    assert.ok(account.orders.some((o) => o.status === 'filled'));
    assert.ok(portfolioValue(account, quotes) > START_CASH - 2_000);
  });
});
