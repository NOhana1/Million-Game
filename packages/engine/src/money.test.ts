import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FX_SCALE,
  partsPerMillion,
  percentOf,
  shekelsToAgorot,
  UNIT_SCALE,
  unitsFor,
  valueOf,
} from './index.ts';

const ONE_UNIT = UNIT_SCALE;
const TEN_SHEKELS = 100_000;

describe('valueOf', () => {
  it('values a shekel security', () => {
    assert.equal(valueOf(ONE_UNIT, TEN_SHEKELS, FX_SCALE), 1_000);
  });

  it('converts a dollar security at the given rate', () => {
    assert.equal(valueOf(ONE_UNIT, TEN_SHEKELS, 34_200), 3_420);
  });

  it('rounds down to the agora', () => {
    assert.equal(valueOf(333_333, TEN_SHEKELS, FX_SCALE), 333);
    assert.equal(valueOf(999_999, TEN_SHEKELS, FX_SCALE), 999);
  });

  it('is exact when the product is too large for a float', () => {
    const expected = Number((123_456_789_012n * 1_234_567n * 34_217n * 100n) / 10n ** 14n);
    assert.equal(valueOf(123_456_789_012, 1_234_567, 34_217), expected);
  });

  it('is worth zero with no units', () => {
    assert.equal(valueOf(0, TEN_SHEKELS, FX_SCALE), 0);
  });

  it('rejects fractions, negatives and zero prices', () => {
    assert.throws(() => valueOf(1.5, TEN_SHEKELS, FX_SCALE), RangeError);
    assert.throws(() => valueOf(-1, TEN_SHEKELS, FX_SCALE), RangeError);
    assert.throws(() => valueOf(1, 0, FX_SCALE), RangeError);
    assert.throws(() => valueOf(1, TEN_SHEKELS, 0), RangeError);
    assert.throws(() => valueOf(Number.NaN, TEN_SHEKELS, FX_SCALE), RangeError);
  });
});

describe('unitsFor', () => {
  it('allows fractional units', () => {
    assert.equal(unitsFor(1_500, TEN_SHEKELS, FX_SCALE), 1_500_000);
  });

  it('rounds down to the millionth of a unit', () => {
    assert.equal(unitsFor(1_000, 30_000, FX_SCALE), 3_333_333);
  });

  it('converts shekels to dollars at the given rate', () => {
    assert.equal(unitsFor(3_420, TEN_SHEKELS, 34_200), ONE_UNIT);
  });

  it('rejects a zero price', () => {
    assert.throws(() => unitsFor(100, 0, FX_SCALE), RangeError);
  });

  it('never gives back more value than was paid', () => {
    for (let amount = 1; amount < 200_000; amount += 997) {
      for (const [price, fx] of [
        [197_200, FX_SCALE],
        [384_500, 34_217],
        [7, 29_999],
      ] as const) {
        assert.ok(valueOf(unitsFor(amount, price, fx), price, fx) <= amount);
      }
    }
  });
});

describe('percentOf', () => {
  it('takes a percentage and rounds down', () => {
    assert.equal(percentOf(100_000_000, 20), 20_000_000);
    assert.equal(percentOf(99, 20), 19);
  });
});

describe('partsPerMillion', () => {
  it('handles gains and losses, rounding toward zero', () => {
    assert.equal(partsPerMillion(1, 3), 333_333);
    assert.equal(partsPerMillion(-1, 3), -333_333);
    assert.equal(partsPerMillion(0, 3), 0);
  });

  it('rejects a zero base', () => {
    assert.throws(() => partsPerMillion(1, 0), RangeError);
  });
});

describe('shekelsToAgorot', () => {
  it('avoids float error on typed amounts', () => {
    assert.equal(shekelsToAgorot(19.99), 1_999);
    assert.equal(shekelsToAgorot(1.1), 110);
  });

  it('passes through input that is not a number', () => {
    assert.ok(Number.isNaN(shekelsToAgorot(Number.NaN)));
  });
});
