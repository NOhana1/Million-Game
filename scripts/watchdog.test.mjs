// Tests the watchdog's decisions without touching the game or GitHub.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { alertBody, decide, runChecks } from './watchdog.mjs';

const ok = { name: 'Website loads', ok: true, problem: null };
const late = { name: 'Orders fill on time', ok: false, problem: 'A market open passed 23 min ago.' };
const down = { name: 'Server answers', ok: false, problem: 'The health check answered 500.' };

const issueFor = (results) => ({ number: 7, body: alertBody(results, 0, '') });

describe('watchdog alerts', () => {
  it('stays quiet when all is well and nothing is open', () => {
    assert.equal(decide([ok], null), 'quiet');
  });

  it('opens one alert for a new failure', () => {
    assert.equal(decide([ok, late], null), 'open');
  });

  it('sends nothing more while the same failure goes on', () => {
    assert.equal(decide([ok, late], issueFor([ok, late])), 'quiet');
  });

  it('updates the alert when a different check fails', () => {
    assert.equal(decide([down, late], issueFor([ok, late])), 'update');
  });

  it('closes the alert once everything passes', () => {
    assert.equal(decide([ok], issueFor([ok, late])), 'close');
  });

  it('says what failed and when, in the alert', () => {
    const body = alertBody([ok, late], Date.UTC(2026, 10, 9, 10, 0), 'https://example.test/run');
    assert.match(body, /Orders fill on time \| A market open passed 23 min ago/);
    assert.match(body, /2026-11-09T10:00:00.000Z/);
    assert.match(body, /12:00/); // the same moment in Israel
    assert.match(body, /https:\/\/example.test\/run/);
  });
});

describe('watchdog retries', () => {
  it('believes a failure only after it repeats', async () => {
    let calls = 0;
    const flaky = { name: 'Flaky', run: async () => (++calls < 2 ? 'down' : null) };
    const [result] = await runChecks([flaky], 0);
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
  });

  it('reports a failure that keeps happening, and a check that throws', async () => {
    const results = await runChecks(
      [
        { name: 'Down', run: async () => 'down' },
        { name: 'Throws', run: async () => { throw new Error('no network'); } },
      ],
      0,
    );
    assert.deepEqual(results.map((r) => r.ok), [false, false]);
    assert.match(results[1].problem, /no network/);
  });
});
