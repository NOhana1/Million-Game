import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { israelDay, nextStreak } from './streak.ts';

describe('daily streak', () => {
  it('starts at one', () => {
    assert.deepEqual(nextStreak(undefined, '2026-11-07'), { days: 1, best: 1, lastDay: '2026-11-07' });
  });

  it('grows on the next day, and not twice on the same day', () => {
    const first = nextStreak(undefined, '2026-11-07');
    const again = nextStreak(first, '2026-11-07');
    assert.equal(again, first);
    assert.deepEqual(nextStreak(first, '2026-11-08'), { days: 2, best: 2, lastDay: '2026-11-08' });
  });

  it('starts again after a missed day, and keeps the best', () => {
    const long = { days: 5, best: 5, lastDay: '2026-11-07' };
    assert.deepEqual(nextStreak(long, '2026-11-09'), { days: 1, best: 5, lastDay: '2026-11-09' });
  });

  it('crosses months and years', () => {
    assert.equal(nextStreak({ days: 3, best: 3, lastDay: '2026-11-30' }, '2026-12-01').days, 4);
    assert.equal(nextStreak({ days: 3, best: 3, lastDay: '2026-12-31' }, '2027-01-01').days, 4);
  });

  it('counts days in Israel time', () => {
    // 23:30 in London on 7 November is already 8 November in Israel.
    assert.equal(israelDay(Date.UTC(2026, 10, 7, 23, 30)), '2026-11-08');
    assert.equal(israelDay(Date.UTC(2026, 10, 7, 12, 0)), '2026-11-07');
  });
});
