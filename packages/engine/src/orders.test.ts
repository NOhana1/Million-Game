import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as engine from './index.ts';
import {
  type Account,
  fillOrder,
  FX_SCALE,
  holdingValue,
  maxOrderAmount,
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
  return fillOrder(account, order.id, TEN);
}

describe('rule 1: starting cash', () => {
  it('starts with ₪1,000,000 and nothing else', () => {
    assert.deepEqual(newAccount(), { cash: START_CASH, holdings: {}, orders: [] });
    assert.equal(START_CASH, 100_000_000);
  });
});

describe('rule 2: orders by shekel amount, fractional units', () => {
  it('buys a fraction of a unit', () => {
    const account = holdingOf(1_500); // ₪15 at ₪10
    assert.equal(account.holdings.TASE1, 1_500_000);
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
    const filled = fillOrder(account, order.id, { price: 200_000, fx: FX_SCALE });
    assert.equal(filled.holdings.TASE1, 50_000_000); // ₪1,000 at ₪20
    assert.equal(filled.orders[0]?.fill?.price, 200_000);
  });

  it('stamps the fill with the execution time', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const filled = fillOrder(account, order.id, TEN);
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
    const settled = settleDueOrders(account, order.execution.at - 1, () => TEN);
    assert.equal(settled, account);
  });

  it('fills an order exactly at its execution time', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const settled = settleDueOrders(account, order.execution.at, () => TEN);
    assert.equal(settled.orders[0]?.status, 'filled');
  });

  it('handles a long jump, in execution order, with each order’s own price', () => {
    const first = place(newAccount(), request('buy', 100_000, us)); // US open, 14:30
    const second = place(first.account, request('buy', 100_000)); // Tel Aviv close, 15:30
    const order = second.account.orders;
    const seen: string[] = [];
    const settled = settleDueOrders(second.account, utc('2026-11-20T00:00:00'), (o) => {
      seen.push(o.id);
      return o.securityId === 'US1' ? { price: 100_000, fx: 30_000 } : TEN;
    });
    assert.deepEqual(seen, [order[0]?.id, order[1]?.id]);
    assert.equal(settled.holdings.US1, 33_333_333); // ₪1,000 at $10 x 3.0
    assert.equal(settled.holdings.TASE1, 100_000_000); // ₪1,000 at ₪10
  });

  it('fills orders for the same moment in submission order', () => {
    const start = holdingOf(100_000);
    const a = place(start, request('sell', 70_000));
    const b = place(a.account, request('sell', 30_000));
    const settled = settleDueOrders(b.account, utc('2026-11-10T00:00:00'), () => ({
      price: 50_000,
      fx: FX_SCALE,
    }));
    // At ₪5, the first sale wants 140 units but only 100 are held, so the second gets none.
    assert.equal(settled.orders[1]?.fill?.units, 100_000_000);
    assert.equal(settled.orders[2]?.fill?.units, 0);
  });

  it('is safe to run twice', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const once = settleDueOrders(account, order.execution.at, () => TEN);
    const twice = settleDueOrders(once, order.execution.at, () => ({ price: 1, fx: 1 }));
    assert.deepEqual(twice, once);
  });
});

describe('fillOrder', () => {
  it('changes nothing for an order that is already filled', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const filled = fillOrder(account, order.id, TEN);
    assert.equal(fillOrder(filled, order.id, { price: 1, fx: 1 }), filled);
  });

  it('throws for an unknown order', () => {
    assert.throws(() => fillOrder(newAccount(), 'missing', TEN));
  });

  it('never changes the account it receives', () => {
    const { account, order } = place(newAccount(), request('buy', 100_000));
    const before = structuredClone(account);
    fillOrder(account, order.id, TEN);
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
    const filled = fillOrder(account, order.id, { price: 7_777, fx: FX_SCALE });
    assert.equal(filled.cash, START_CASH - 100_000);
    assert.equal(reservedCash(filled), 0);
    assert.equal(filled.orders[0]?.fill?.value, 100_000);
  });

  it('rejects a buy above available cash', () => {
    const poor: Account = { cash: 1_000, holdings: {}, orders: [] };
    const result = placeOrder(poor, request('buy', 1_001), tenEach);
    assert.deepEqual(result, { ok: false, problem: 'INSUFFICIENT_CASH' });
  });

  it('counts cash already held by pending buys', () => {
    const { account } = place(newAccount(), request('buy', 20_000_000));
    const spent = { ...account, cash: 500 };
    assert.equal(orderProblem(spent, 'OTHER', 'buy', 501, tenEach), 'INSUFFICIENT_CASH');
  });

  it('does not let pending sale proceeds fund a buy', () => {
    const account: Account = { cash: 0, holdings: { TASE1: 5_000_000 }, orders: [] };
    const selling = place(account, request('sell', 5_000));
    assert.equal(orderProblem(selling.account, 'OTHER', 'buy', 100, tenEach), 'INSUFFICIENT_CASH');
  });
});

describe('rule 4: no short selling', () => {
  it('rejects a sale with no holding', () => {
    const result = placeOrder(newAccount(), request('sell', 100), tenEach);
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
    assert.equal(orderProblem(account, 'TASE1', 'sell', 1, tenEach), 'INSUFFICIENT_HOLDING');
  });

  it('adds sale proceeds to cash only when the order fills', () => {
    const start = holdingOf(100_000);
    const { account, order } = place(start, request('sell', 40_000));
    assert.equal(account.cash, start.cash);
    const filled = fillOrder(account, order.id, TEN);
    assert.equal(filled.cash, start.cash + 40_000);
    assert.equal(filled.holdings.TASE1, 60_000_000);
  });

  it('sells the holding at most when the price has fallen', () => {
    const start = holdingOf(100_000); // 100 units
    const { account, order } = place(start, request('sell', 100_000));
    const filled = fillOrder(account, order.id, { price: 50_000, fx: FX_SCALE });
    assert.equal(filled.orders[1]?.fill?.units, 100_000_000);
    assert.equal(filled.orders[1]?.fill?.value, 50_000);
    assert.equal(filled.holdings.TASE1, undefined);
  });

  it('sells fewer units when the price has risen', () => {
    const start = holdingOf(100_000);
    const { account, order } = place(start, request('sell', 100_000));
    const filled = fillOrder(account, order.id, { price: 200_000, fx: FX_SCALE });
    assert.equal(filled.holdings.TASE1, 50_000_000);
    assert.equal(filled.orders[1]?.fill?.value, 100_000);
  });

  it('removes a holding that reaches zero', () => {
    const start = holdingOf(100_000);
    const { account, order } = place(start, request('sell', 100_000));
    assert.deepEqual(fillOrder(account, order.id, TEN).holdings, {});
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
    assert.equal(orderProblem(account, 'TASE1', 'buy', 1, tenEach), 'POSITION_LIMIT');
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
    const { account, order } = place(newAccount(), request('buy', 3_420, us));
    const filled = fillOrder(account, order.id, { price: 100_000, fx: 34_200 });
    assert.equal(filled.holdings.US1, 1_000_000);
    assert.equal(filled.orders[0]?.fill?.fx, 34_200);
  });

  it('converts a sale back to shekels at the rate at execution', () => {
    const start: Account = { cash: 0, holdings: { US1: 1_000_000 }, orders: [] };
    const quotes: QuoteSource = () => ({ price: 100_000, fx: 34_200 });
    const { account, order } = place(start, request('sell', 3_000, us), quotes);
    const filled = fillOrder(account, order.id, { price: 100_000, fx: 30_000 });
    assert.equal(filled.cash, 3_000);
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
      const amount = 1 + random(30_000_000);
      const result = placeOrder(
        account,
        { id: `random-${step}`, security: security(id), side, amount, placedAt: now },
        quotes,
      );
      if (result.ok) account = result.account;

      now += 3_600_000;
      const before = portfolioValue(account, quotes);
      account = settleDueOrders(account, now, (o) => quotes(o.securityId));
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
