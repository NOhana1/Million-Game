// All stored numbers are whole integers, so results never depend on floating point.
// Products can pass 2^53, so they are calculated with BigInt and converted back.
// One rounding rule everywhere: always round down.

export type Agorot = number; // 1/100 of a shekel
export type Price = number; // 1/10,000 of the security's currency
export type FxRate = number; // shekels per dollar, in 1/10,000
export type Units = number; // 1/1,000,000 of a unit

export const AGOROT_PER_SHEKEL = 100;
export const PRICE_SCALE = 10_000;
export const FX_SCALE = 10_000;
export const UNIT_SCALE = 1_000_000;
export const PPM_SCALE = 1_000_000;

const VALUE_DIVISOR = BigInt(UNIT_SCALE) * BigInt(PRICE_SCALE) * BigInt(FX_SCALE);
const AGOROT = BigInt(AGOROT_PER_SHEKEL);

function exact(n: number, label: string): bigint {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${n}`);
  }
  return BigInt(n);
}

function positive(n: number, label: string): bigint {
  const value = exact(n, label);
  if (value === 0n) throw new RangeError(`${label} must be above zero`);
  return value;
}

function toNumber(n: bigint): number {
  const result = Number(n);
  if (!Number.isSafeInteger(result)) throw new RangeError(`Result too large: ${n}`);
  return result;
}

/** Shekel value of a position, rounded down to the agora. */
export function valueOf(units: Units, price: Price, fx: FxRate): Agorot {
  const product = exact(units, 'units') * positive(price, 'price') * positive(fx, 'fx');
  return toNumber((product * AGOROT) / VALUE_DIVISOR);
}

/** Units that a shekel amount buys, rounded down to the millionth of a unit. */
export function unitsFor(amount: Agorot, price: Price, fx: FxRate): Units {
  const numerator = exact(amount, 'amount') * VALUE_DIVISOR;
  return toNumber(numerator / (positive(price, 'price') * positive(fx, 'fx') * AGOROT));
}

/** A whole-number percentage of an amount, rounded down. */
export function percentOf(amount: Agorot, percent: number): Agorot {
  return toNumber((exact(amount, 'amount') * exact(percent, 'percent')) / 100n);
}

/** part / whole in parts per million, rounded toward zero. `part` may be negative. */
export function partsPerMillion(part: number, whole: number): number {
  const ratio = (exact(Math.abs(part), 'part') * BigInt(PPM_SCALE)) / positive(whole, 'whole');
  return part < 0 ? -toNumber(ratio) : toNumber(ratio);
}

/** Converts typed shekels to agorot. Returns NaN for input that isn't a number. */
export function shekelsToAgorot(shekels: number): Agorot {
  return Math.round(shekels * AGOROT_PER_SHEKEL);
}
