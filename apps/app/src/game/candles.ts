// Candles for the price charts. Each candle covers one fixed stretch of game time, such as one
// hour or one day, and holds the first, highest, lowest and last price inside it. The stretch is
// the shortest that fits on the screen, so a short range shows hours and a long one weeks.

export type Candle = { at: number; open: number; high: number; low: number; close: number };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// The first Monday of 1970 at 00:00 UTC, so weeks start on Monday.
const MONDAY = 4 * DAY;

const MINUTE = 60 * 1000;
const PRICES_PER_CANDLE = 3; // fewer, and a candle is barely more than a dot on the line

const PERIODS = [
  { label: '15 minutes', ms: 15 * MINUTE },
  { label: '30 minutes', ms: 30 * MINUTE },
  { label: '1 hour', ms: HOUR },
  { label: '2 hours', ms: 2 * HOUR },
  { label: '4 hours', ms: 4 * HOUR },
  { label: '1 day', ms: DAY },
  { label: '1 week', ms: 7 * DAY },
  { label: '4 weeks', ms: 28 * DAY },
] as const;

const bucketOf = (at: number, ms: number) => Math.floor((at - (ms >= 7 * DAY ? MONDAY : 0)) / ms);

/**
 * Groups the prices into candles of one fixed period: the shortest that fits at most `most`
 * candles on the screen, with a few prices in each on average.
 */
export function toCandles(points: readonly { at: number; price: number }[], most: number) {
  const limit = Math.max(1, Math.min(most, Math.floor(points.length / PRICES_PER_CANDLE)));
  const fits = (ms: number) => new Set(points.map((p) => bucketOf(p.at, ms))).size <= limit;
  const period = PERIODS.find((p) => fits(p.ms)) ?? PERIODS[PERIODS.length - 1];

  const candles: Candle[] = [];
  let bucket: number | null = null;
  for (const { at, price } of points) {
    const current = bucketOf(at, period.ms);
    const last = candles.at(-1);
    if (bucket !== current || !last) {
      // A candle opens where the one before it closed, so there are no gaps between bodies.
      candles.push({ at, open: last?.close ?? price, high: price, low: price, close: price });
      bucket = current;
    } else {
      last.at = at;
      last.high = Math.max(last.high, price, last.open);
      last.low = Math.min(last.low, price, last.open);
      last.close = price;
    }
  }
  for (const candle of candles) {
    candle.high = Math.max(candle.high, candle.open);
    candle.low = Math.min(candle.low, candle.open);
  }
  return { candles, period: period.label };
}
