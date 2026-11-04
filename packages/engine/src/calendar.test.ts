import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { executionFor, isMarketOpen, nextMarketEvent, nextSessionChange } from './index.ts';

const utc = (iso: string) => Date.parse(`${iso}Z`);

// In these November 2026 dates, Israel is UTC+2 and New York is UTC-5.
describe('Tel Aviv hours', () => {
  it('opens at 10:00, inclusive', () => {
    assert.equal(isMarketOpen('TASE', utc('2026-11-09T07:59:59')), false);
    assert.equal(isMarketOpen('TASE', utc('2026-11-09T08:00:00')), true);
  });

  it('closes at 17:30 Monday to Thursday, exclusive', () => {
    assert.equal(isMarketOpen('TASE', utc('2026-11-12T15:29:59')), true);
    assert.equal(isMarketOpen('TASE', utc('2026-11-12T15:30:00')), false);
  });

  it('closes at 13:50 on Friday', () => {
    assert.equal(isMarketOpen('TASE', utc('2026-11-13T11:49:59')), true);
    assert.equal(isMarketOpen('TASE', utc('2026-11-13T11:50:00')), false);
  });

  it('is closed on Saturday and Sunday', () => {
    assert.equal(isMarketOpen('TASE', utc('2026-11-14T10:00:00')), false);
    assert.equal(isMarketOpen('TASE', utc('2026-11-15T10:00:00')), false);
  });
});

describe('US hours', () => {
  it('opens at 9:30 New York time, inclusive', () => {
    assert.equal(isMarketOpen('US', utc('2026-11-09T14:29:59')), false);
    assert.equal(isMarketOpen('US', utc('2026-11-09T14:30:00')), true);
  });

  it('closes at 16:00 New York time, exclusive', () => {
    assert.equal(isMarketOpen('US', utc('2026-11-09T20:59:59')), true);
    assert.equal(isMarketOpen('US', utc('2026-11-09T21:00:00')), false);
  });

  it('keeps full hours on Friday', () => {
    assert.equal(isMarketOpen('US', utc('2026-11-13T20:59:59')), true);
  });

  it('is closed at weekends', () => {
    assert.equal(isMarketOpen('US', utc('2026-11-14T15:00:00')), false);
    assert.equal(isMarketOpen('US', utc('2026-11-15T15:00:00')), false);
  });
});

describe('daylight saving', () => {
  it('moves the US open by an hour when New York changes its clocks', () => {
    assert.equal(isMarketOpen('US', utc('2026-10-28T13:29:59')), false);
    assert.equal(isMarketOpen('US', utc('2026-10-28T13:30:00')), true);
  });

  it('moves the Tel Aviv open by an hour in Israeli summer time', () => {
    assert.equal(isMarketOpen('TASE', utc('2026-07-15T06:59:59')), false);
    assert.equal(isMarketOpen('TASE', utc('2026-07-15T07:00:00')), true);
  });

  it('finds the next open across a clock change', () => {
    const fridayEvening = utc('2026-10-30T21:00:00');
    assert.deepEqual(executionFor('US', fridayEvening), {
      kind: 'open',
      at: utc('2026-11-02T14:30:00'),
    });
  });
});

describe('executionFor (rule 3)', () => {
  it('uses the same day close for an order during the session', () => {
    assert.deepEqual(executionFor('TASE', utc('2026-11-09T10:00:00')), {
      kind: 'close',
      at: utc('2026-11-09T15:30:00'),
    });
  });

  it('uses the short Friday close', () => {
    assert.deepEqual(executionFor('TASE', utc('2026-11-13T09:00:00')), {
      kind: 'close',
      at: utc('2026-11-13T11:50:00'),
    });
  });

  it('treats an order exactly at the open as in session', () => {
    assert.equal(executionFor('TASE', utc('2026-11-09T08:00:00')).kind, 'close');
  });

  it('treats an order exactly at the close as out of session', () => {
    assert.deepEqual(executionFor('TASE', utc('2026-11-09T15:30:00')), {
      kind: 'open',
      at: utc('2026-11-10T08:00:00'),
    });
  });

  it('uses the same day open for an order before the open', () => {
    assert.deepEqual(executionFor('TASE', utc('2026-11-09T06:00:00')), {
      kind: 'open',
      at: utc('2026-11-09T08:00:00'),
    });
  });

  it('skips the weekend after Friday', () => {
    assert.deepEqual(executionFor('TASE', utc('2026-11-13T12:00:00')), {
      kind: 'open',
      at: utc('2026-11-16T08:00:00'),
    });
    assert.deepEqual(executionFor('US', utc('2026-11-13T22:00:00')), {
      kind: 'open',
      at: utc('2026-11-16T14:30:00'),
    });
  });

  it('works when the order time is not on a round minute', () => {
    assert.equal(executionFor('TASE', utc('2026-11-09T10:03:27.123')).at, utc('2026-11-09T15:30:00'));
  });

  it('judges each market separately at the same moment', () => {
    const lateMorning = utc('2026-11-09T10:00:00');
    assert.equal(executionFor('TASE', lateMorning).kind, 'close');
    assert.equal(executionFor('US', lateMorning).kind, 'open');
  });
});

describe('next events', () => {
  it('is strictly after the given time', () => {
    const open = utc('2026-11-09T08:00:00');
    assert.equal(nextSessionChange('TASE', open), utc('2026-11-09T15:30:00'));
  });

  it('walks through both markets in time order', () => {
    let t = utc('2026-11-09T07:00:00');
    const seen: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      t = nextMarketEvent(t);
      seen.push(t);
    }
    assert.deepEqual(seen, [
      utc('2026-11-09T08:00:00'),
      utc('2026-11-09T14:30:00'),
      utc('2026-11-09T15:30:00'),
      utc('2026-11-09T21:00:00'),
    ]);
  });
});
