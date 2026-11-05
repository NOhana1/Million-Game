import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type Account,
  FX_SCALE,
  nextWeek,
  type QuoteSource,
  recordValue,
  replaySteps,
  startWeek,
  weeklyTable,
  type WeekRecord,
} from './index.ts';

const utc = (iso: string) => Date.parse(`${iso}Z`);
const MONDAY = utc('2026-11-09T08:00:00');
const FRIDAY_CLOSE = utc('2026-11-13T21:00:00');
const START = 100_000_000;

const record = (peakFallValue: number, held = true): WeekRecord =>
  recordValue(startWeek(MONDAY, START, false), peakFallValue, held);

describe('startWeek', () => {
  it('ends at the Friday US close and starts with no fall', () => {
    assert.deepEqual(startWeek(MONDAY, START, false), {
      endsAt: FRIDAY_CLOSE,
      startValue: START,
      drawdown: { peak: START, maxFallPpm: 0 },
      heldSecurity: false,
    });
  });

  it('measures a mid-week joiner from when they joined', () => {
    const wednesday = utc('2026-11-11T12:00:00');
    assert.equal(startWeek(wednesday, START, false).endsAt, FRIDAY_CLOSE);
  });
});

describe('recordValue', () => {
  it('tracks the fall from the week’s peak', () => {
    const week = [120_000_000, 90_000_000, 110_000_000].reduce(
      (current, value) => recordValue(current, value, true),
      startWeek(MONDAY, START, false),
    );
    assert.equal(week.drawdown.maxFallPpm, 250_000);
  });

  it('remembers holding a security even after selling it', () => {
    const held = recordValue(startWeek(MONDAY, START, false), START, true);
    assert.equal(recordValue(held, START, false).heldSecurity, true);
  });
});

describe('nextWeek', () => {
  it('starts from the end value and forgets the old fall', () => {
    const next = nextWeek(record(80_000_000), 80_000_000, false);
    assert.deepEqual(next, {
      endsAt: utc('2026-11-20T21:00:00'),
      startValue: 80_000_000,
      drawdown: { peak: 80_000_000, maxFallPpm: 0 },
      heldSecurity: false,
    });
  });

  it('counts a holding carried into the new week', () => {
    assert.equal(nextWeek(record(START), START, true).heldSecurity, true);
  });
});

describe('replaySteps', () => {
  const account: Account = { cash: 50_000_000, holdings: { A: 500_000_000 }, orders: [] };
  const at = (shekels: number): QuoteSource => () => ({
    price: shekels * 10_000,
    fx: FX_SCALE,
  });

  it('catches a fall that recovers before the next open or close', () => {
    const week = startWeek(MONDAY, START, true);
    const replayed = replaySteps(week, account, [at(1_000), at(600), at(1_000)]);
    // ₪500,000 cash plus 500 units: ₪1,000,000 at ₪1,000, and ₪800,000 at ₪600.
    assert.equal(replayed.drawdown.maxFallPpm, 200_000);
  });

  it('gives the same result as recording each step live', () => {
    const steps = [10, 12, 7, 9, 13, 5].map(at);
    const small: Account = { cash: 0, holdings: { A: 1_000_000 }, orders: [] };
    const week = startWeek(MONDAY, 1_000, true);
    const live = [1_000, 1_200, 700, 900, 1_300, 500].reduce(
      (current, value) => recordValue(current, value, true),
      week,
    );
    assert.deepEqual(replaySteps(week, small, steps), live);
  });

  it('marks the player as holding a security', () => {
    const week = startWeek(MONDAY, START, false);
    assert.equal(replaySteps(week, account, [at(10)]).heldSecurity, true);
  });

  it('changes nothing with no steps', () => {
    const week = startWeek(MONDAY, START, false);
    assert.deepEqual(replaySteps(week, account, []), week);
  });
});

describe('weeklyTable', () => {
  it('leaves out players who held nothing all week', () => {
    const table = weeklyTable([
      { id: 'active', week: record(START, true), value: 90_000_000 },
      { id: 'cash', week: record(START, false), value: START },
    ]);
    assert.deepEqual(
      table.map((row) => row.id),
      ['active'],
    );
  });

  it('keeps a player who held something and went back to cash', () => {
    const sold = recordValue(record(START, true), START, false);
    assert.equal(weeklyTable([{ id: 'a', week: sold, value: START }]).length, 1);
  });

  it('measures return from each player’s own start value', () => {
    const joined = startWeek(MONDAY, 50_000_000, true);
    const [row] = weeklyTable([{ id: 'a', week: joined, value: 55_000_000 }]);
    assert.equal(row?.returnPpm, 100_000);
  });

  it('ranks only eligible players, so cash accounts don’t shift percentiles', () => {
    const table = weeklyTable([
      { id: 'up', week: record(START), value: 110_000_000 },
      { id: 'down', week: record(START), value: 90_000_000 },
      { id: 'cash', week: record(START, false), value: START },
    ]);
    assert.equal(table[0]?.returnRank, 100);
    assert.equal(table[1]?.returnRank, 0);
  });

  it('is empty when nobody held anything', () => {
    assert.deepEqual(weeklyTable([{ id: 'a', week: record(START, false), value: START }]), []);
  });

  it('survives a player whose week started at zero', () => {
    const week = startWeek(MONDAY, 0, true);
    assert.equal(weeklyTable([{ id: 'a', week, value: 0 }])[0]?.returnPpm, 0);
  });
});
