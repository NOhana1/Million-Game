import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dailyRecap, FX_SCALE, type Order, type QuoteSource, type RecapInput } from './index.ts';

const NOW = Date.UTC(2026, 10, 10, 15, 30);
const HOUR = 60 * 60 * 1000;
const ONE_UNIT = 1_000_000;

const shekels = (prices: Record<string, number>): QuoteSource => (id) => ({
  price: (prices[id] ?? 0) * 10_000,
  fx: FX_SCALE,
});

const input = (overrides: Partial<RecapInput>): RecapInput => ({
  now: NOW,
  value: 100_000_000,
  holdings: {},
  orders: [],
  quotes: shekels({}),
  quotesDayAgo: shekels({}),
  ...overrides,
});

const filled = (id: string, at: number): Order => ({
  id,
  securityId: 'A',
  side: 'buy',
  amount: 100_000,
  placedAt: at - HOUR,
  execution: { kind: 'close', at },
  status: 'filled',
  fill: { units: ONE_UNIT, price: 100_000, fx: FX_SCALE, value: 100_000, refund: 0, at },
});

describe('dailyRecap', () => {
  it('is empty for a player with no holdings or orders', () => {
    assert.deepEqual(dailyRecap(input({})), {
      change: 0,
      changePpm: 0,
      best: null,
      worst: null,
      fills: [],
    });
  });

  it('adds up what the holdings gained and lost', () => {
    const recap = dailyRecap(
      input({
        holdings: { A: 100 * ONE_UNIT, B: 100 * ONE_UNIT },
        quotes: shekels({ A: 110, B: 95 }),
        quotesDayAgo: shekels({ A: 100, B: 100 }),
      }),
    );
    assert.equal(recap.change, 50_000); // +₪1,000 and -₪500
  });

  it('measures the change against the whole portfolio, including cash', () => {
    const recap = dailyRecap(
      input({
        value: 101_000_000,
        holdings: { A: 1_000 * ONE_UNIT },
        quotes: shekels({ A: 110 }),
        quotesDayAgo: shekels({ A: 100 }),
      }),
    );
    assert.equal(recap.change, 1_000_000);
    assert.equal(recap.changePpm, 10_000); // ₪10,000 on ₪1,000,000 is 1%
  });

  it('shows a loss as negative', () => {
    const recap = dailyRecap(
      input({
        value: 99_000_000,
        holdings: { A: 1_000 * ONE_UNIT },
        quotes: shekels({ A: 90 }),
        quotesDayAgo: shekels({ A: 100 }),
      }),
    );
    assert.equal(recap.change, -1_000_000);
    assert.equal(recap.changePpm, -10_000);
  });

  it('picks the best and worst holding by percentage, not by size', () => {
    const recap = dailyRecap(
      input({
        holdings: { BIG: 1_000 * ONE_UNIT, SMALL: 1 * ONE_UNIT, LOSER: 10 * ONE_UNIT },
        quotes: shekels({ BIG: 101, SMALL: 120, LOSER: 90 }),
        quotesDayAgo: shekels({ BIG: 100, SMALL: 100, LOSER: 100 }),
      }),
    );
    assert.equal(recap.best?.securityId, 'SMALL');
    assert.equal(recap.best?.changePpm, 200_000);
    assert.equal(recap.worst?.securityId, 'LOSER');
    assert.equal(recap.worst?.changePpm, -100_000);
  });

  it('has no worst with a single holding', () => {
    const recap = dailyRecap(
      input({
        holdings: { A: ONE_UNIT },
        quotes: shekels({ A: 90 }),
        quotesDayAgo: shekels({ A: 100 }),
      }),
    );
    assert.equal(recap.best?.securityId, 'A');
    assert.equal(recap.worst, null);
  });

  it('breaks a tie by security id, so the result never varies', () => {
    const recap = dailyRecap(
      input({
        holdings: { B: ONE_UNIT, A: ONE_UNIT },
        quotes: shekels({ A: 100, B: 100 }),
        quotesDayAgo: shekels({ A: 100, B: 100 }),
      }),
    );
    assert.equal(recap.best?.securityId, 'A');
  });

  it('includes the dollar rate in the change', () => {
    const recap = dailyRecap(
      input({
        holdings: { US: 100 * ONE_UNIT },
        quotes: () => ({ price: 100_000, fx: 36_000 }),
        quotesDayAgo: () => ({ price: 100_000, fx: 35_000 }),
      }),
    );
    assert.equal(recap.change, 10_000); // $1,000 at ₪3.60 against ₪3.50
  });

  it('lists fills from the last day, newest first', () => {
    const recap = dailyRecap(
      input({ orders: [filled('old', NOW - 2 * HOUR), filled('new', NOW - HOUR)] }),
    );
    assert.deepEqual(
      recap.fills.map((f) => f.fill.at),
      [NOW - HOUR, NOW - 2 * HOUR],
    );
  });

  it('leaves out fills older than a day, and exactly a day old', () => {
    const recap = dailyRecap(
      input({ orders: [filled('edge', NOW - 24 * HOUR), filled('old', NOW - 25 * HOUR)] }),
    );
    assert.deepEqual(recap.fills, []);
  });

  it('includes a fill at this exact moment, and never a later one', () => {
    const recap = dailyRecap(input({ orders: [filled('now', NOW), filled('later', NOW + 1)] }));
    assert.equal(recap.fills.length, 1);
  });

  it('leaves out pending orders', () => {
    const { fill: _unused, ...rest } = filled('x', NOW);
    const pending: Order = { ...rest, status: 'pending' };
    assert.deepEqual(dailyRecap(input({ orders: [pending] })).fills, []);
  });

  it('handles a portfolio worth nothing a day ago', () => {
    const recap = dailyRecap(input({ value: 0 }));
    assert.equal(recap.changePpm, 0);
  });

  it('changes nothing it receives', () => {
    const orders = [filled('a', NOW - HOUR), filled('b', NOW - 2 * HOUR)];
    const before = structuredClone(orders);
    dailyRecap(input({ orders }));
    assert.deepEqual(orders, before);
  });
});
