import { nextMarketEvent } from '@portfolio-league/engine';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Clock } from '../clock.ts';
import { memoryStore } from '../store/memory.ts';
import { testApp, TEST_WORLD } from '../testing.ts';
import { fillStatus, LATE_AFTER_MS } from './status.ts';

const SPEED = 60;
const clockAt = (world: number, paused = false): Clock => ({
  anchorWorld: world,
  anchorReal: 0,
  speed: SPEED,
  paused,
});

describe('fill status', () => {
  const cursor = TEST_WORLD;
  const due = nextMarketEvent(cursor);
  // The world time when the next open or close has been waiting this long in real time.
  const waited = (realMs: number) => clockAt(due + realMs * SPEED);

  it('is on time while a passed open or close has waited less than the limit', () => {
    const status = fillStatus(waited(LATE_AFTER_MS - 60_000), cursor, 0, false);
    assert.equal(status.late, false);
    assert.equal(status.slotLateSeconds, (LATE_AFTER_MS - 60_000) / 1000);
  });

  it('is late once it has waited longer than the limit', () => {
    assert.equal(fillStatus(waited(LATE_AFTER_MS + 60_000), cursor, 0, false).late, true);
  });

  it('is late when an order has been waiting too long, even if the cursor is fine', () => {
    assert.equal(fillStatus(clockAt(cursor), cursor, 0, true).late, true);
  });

  it('is never late while the clock is paused', () => {
    const paused = { ...waited(LATE_AFTER_MS * 10), paused: true };
    assert.deepEqual(fillStatus(paused, cursor, 0, true), {
      late: false,
      slotLateSeconds: 0,
      overdueOrders: false,
    });
  });
});

describe('/status', () => {
  it('reports late fills, changes nothing itself, and is on time once the alarm has run', async () => {
    // Two days in, and nothing filled yet: at this speed, the first open waited about an hour.
    const store = memoryStore(clockAt(TEST_WORLD + 2 * 24 * 3_600_000));
    const app = testApp({ store });
    const read = async () => {
      const response = await app.request('/api/status');
      assert.equal(response.status, 200);
      assert.match(response.headers.get('Cache-Control') ?? '', /s-maxage=60/);
      return (await response.json()) as { settledUpTo: number; fills: { late: boolean } };
    };

    const before = await read();
    assert.equal(before.fills.late, true);
    assert.equal((await read()).settledUpTo, before.settledUpTo); // reading moved nothing

    const tick = await app.request('/api/tick', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
    });
    assert.equal(tick.status, 200);
    const after = await read();
    assert.equal(after.fills.late, false);
    assert.ok(after.settledUpTo > before.settledUpTo);
  });
});
