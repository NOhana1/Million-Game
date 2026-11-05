import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  createWorld,
  FX_SCALE,
  isMarketOpen,
  normalFrom,
  SECURITIES,
  STEP_MS,
  WORLD_START,
  type WorldState,
} from './index.ts';
import { secureNoise } from './secure-noise.ts';

const utc = (iso: string) => Date.parse(`${iso}Z`);
const DAY_MS = 24 * 60 * 60 * 1000;
const world = createWorld(secureNoise('test-secret'));

const correlation = (a: number[], b: number[]) => {
  const mean = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
  const [ma, mb] = [mean(a), mean(b)];
  let [ab, aa, bb] = [0, 0, 0];
  a.forEach((x, i) => {
    const y = b[i] ?? 0;
    ab += (x - ma) * (y - mb);
    aa += (x - ma) ** 2;
    bb += (y - mb) ** 2;
  });
  return ab / Math.sqrt(aa * bb);
};

const returns = (states: WorldState[], read: (state: WorldState) => number) =>
  states.slice(1).map((state, i) => read(state) / read(states[i] as WorldState) - 1);

// About six trading weeks of steps from Tel Aviv's sessions.
const sessionSteps = world
  .stepsBetween(WORLD_START, WORLD_START + 42 * DAY_MS)
  .filter((s) => isMarketOpen('TASE', s.at - STEP_MS) && isMarketOpen('TASE', s.at));

describe('the securities', () => {
  it('has 20, in both markets, with unique ids', () => {
    assert.equal(SECURITIES.length, 20);
    assert.equal(new Set(SECURITIES.map((s) => s.id)).size, 20);
    assert.equal(SECURITIES.filter((s) => s.market === 'TASE').length, 10);
    assert.equal(SECURITIES.filter((s) => s.market === 'US').length, 10);
  });
});

describe('determinism', () => {
  it('gives the same history for the same secret', () => {
    const again = createWorld(secureNoise('test-secret'));
    const at = utc('2026-11-12T12:00:00');
    assert.deepEqual(again.stateAt(at), world.stateAt(at));
  });

  it('gives a different history for a different secret', () => {
    const other = createWorld(secureNoise('another-secret'));
    const at = utc('2026-11-12T12:00:00');
    assert.notDeepEqual(other.stateAt(at).prices, world.stateAt(at).prices);
  });

  it('gives the same price however the clock got there', () => {
    const jumped = createWorld(secureNoise('test-secret'));
    const target = utc('2026-11-20T15:00:00');
    const direct = jumped.priceAt('CYBR', target);
    const stepped = createWorld(secureNoise('test-secret'));
    for (let t = WORLD_START; t < target; t += 7 * STEP_MS) stepped.stateAt(t);
    assert.equal(stepped.priceAt('CYBR', target), direct);
  });

  it('can look back at the past after moving forward', () => {
    const fresh = createWorld(secureNoise('test-secret'));
    const past = utc('2026-11-10T12:00:00');
    const before = fresh.priceAt('NGVS', past);
    fresh.stateAt(utc('2026-12-01T12:00:00'));
    assert.equal(fresh.priceAt('NGVS', past), before);
  });

  it('holds one price for the whole of a step', () => {
    const step = utc('2026-11-09T12:00:00');
    assert.equal(world.priceAt('SHRN', step + STEP_MS - 1), world.priceAt('SHRN', step));
  });

  it('matches the pinned history, so changing the generator fails loudly', () => {
    const states = world.stepsBetween(WORLD_START, utc('2026-11-13T21:00:00'));
    const hash = createHash('sha256').update(JSON.stringify(states)).digest('hex');
    assert.equal(hash, '57cb207d5467070aca8a1ad973a0790cf5092dc401a76c7812728b48470d1f9a');
  });
});

describe('the start of the world', () => {
  it('uses the listed start prices and rate', () => {
    const start = world.stateAt(WORLD_START);
    assert.equal(start.prices.TAIX, 2_124_000);
    assert.equal(start.fx, 3.42 * FX_SCALE);
  });

  it('answers with the start for times before it', () => {
    assert.deepEqual(world.stateAt(WORLD_START - DAY_MS), world.stateAt(WORLD_START));
  });
});

describe('trading hours', () => {
  it('moves prices during a session', () => {
    const open = utc('2026-11-09T09:00:00');
    assert.notEqual(world.priceAt('NGVS', open), world.priceAt('NGVS', open + 12 * STEP_MS));
  });

  it('freezes a market while it is closed', () => {
    const close = utc('2026-11-09T15:30:00');
    assert.equal(world.priceAt('NGVS', close), world.priceAt('NGVS', utc('2026-11-10T07:55:00')));
  });

  it('moves US prices only in US hours', () => {
    const morning = utc('2026-11-10T09:00:00');
    assert.equal(world.priceAt('MRDN', morning), world.priceAt('MRDN', utc('2026-11-10T14:25:00')));
  });

  it('can open at a different price from the last close', () => {
    const gaps = SECURITIES.filter((s) => s.market === 'TASE').filter(
      (s) =>
        world.priceAt(s.id, utc('2026-11-09T15:30:00')) !==
        world.priceAt(s.id, utc('2026-11-10T08:00:00')),
    );
    assert.ok(gaps.length >= 8);
  });

  it('settles the close at the step that ends the session', () => {
    const step = utc('2026-11-09T15:30:00');
    assert.notEqual(world.priceAt('SHRN', step), world.priceAt('SHRN', step - STEP_MS));
  });

  it('keeps every price a positive whole number', () => {
    for (const state of sessionSteps) {
      assert.ok(Object.values(state.prices).every((p) => Number.isSafeInteger(p) && p > 0));
      assert.ok(Number.isSafeInteger(state.fx) && state.fx > 0);
    }
  });
});

describe('the dollar', () => {
  it('moves while a market is trading', () => {
    const start = utc('2026-11-10T09:00:00');
    assert.notEqual(world.usdIlsAt(start), world.usdIlsAt(start + 12 * STEP_MS));
  });

  it('stays frozen from the Friday US close until Monday', () => {
    const fridayClose = utc('2026-11-13T21:00:00');
    assert.equal(world.usdIlsAt(fridayClose), world.usdIlsAt(utc('2026-11-16T08:00:00')));
  });

  it('tends to rise when Tel Aviv falls', () => {
    const fund = returns(sessionSteps, (s) => s.prices.TAIX ?? 1);
    const dollar = returns(sessionSteps, (s) => s.fx);
    assert.ok(correlation(fund, dollar) < -0.1);
  });
});

describe('realistic behaviour', () => {
  const move = (id: string) => returns(sessionSteps, (s) => s.prices[id] ?? 1);

  it('moves securities in the same market together', () => {
    assert.ok(correlation(move('SHRN'), move('ARVA')) > 0.25);
  });

  it('moves a sector more closely than the market alone', () => {
    const overlap = world
      .stepsBetween(WORLD_START, WORLD_START + 42 * DAY_MS)
      .filter((s) => isMarketOpen('US', s.at - STEP_MS) && isMarketOpen('US', s.at));
    const us = (id: string) => returns(overlap, (s) => s.prices[id] ?? 1);
    assert.ok(correlation(us('MRDN'), us('SMTC')) > correlation(us('MRDN'), us('PRFD')) + 0.1);
  });

  it('gives riskier securities larger typical moves', () => {
    const spread = (values: number[]) => Math.sqrt(values.reduce((a, b) => a + b * b, 0));
    assert.ok(spread(move('NGVS')) > 2 * spread(move('TAIX')));
  });

  it('keeps daily moves close to each security’s stated size', () => {
    const closes: number[] = [];
    for (let day = 0; day < 42; day += 1) {
      const at = utc('2026-11-09T15:30:00') + day * DAY_MS;
      if (new Date(at).getUTCDay() >= 1 && new Date(at).getUTCDay() <= 4) {
        closes.push(world.priceAt('SHRN', at));
      }
    }
    const daily = closes.slice(1).map((c, i) => Math.log(c / (closes[i] ?? c)));
    const size = Math.sqrt(daily.reduce((a, b) => a + b * b, 0) / daily.length);
    assert.ok(size > 0.008 && size < 0.035, `daily size was ${size}`);
  });
});

describe('news jumps', () => {
  const quiet = () => [2 ** 31, 2 ** 31, 2 ** 31, 2 ** 31, 2 ** 31, 2 ** 31, 2 ** 32 - 1, 0];
  const newsOn = (draw: number) => (key: string) =>
    key.includes('security|NGVS') || key.includes('security|TAIX')
      ? [2 ** 31, 2 ** 31, 2 ** 31, 2 ** 31, 2 ** 31, 2 ** 31, 0, draw]
      : quiet();
  const firstMove = (noise: (key: string) => readonly number[], id: string) => {
    const test = createWorld(noise);
    const start = test.priceAt(id, WORLD_START);
    return test.priceAt(id, utc('2026-11-09T08:00:00')) / start - 1;
  };

  it('can move a stock sharply in either direction', () => {
    assert.ok(firstMove(newsOn(0), 'NGVS') <= -0.055);
    assert.ok(firstMove(newsOn(2 ** 31), 'NGVS') >= 0.055);
  });

  it('stays within five daily moves', () => {
    assert.ok(Math.abs(firstMove(newsOn(2 ** 31 - 1), 'NGVS')) <= 0.1501);
  });

  it('never hits funds', () => {
    assert.ok(Math.abs(firstMove(newsOn(0), 'TAIX')) < 0.001);
  });

  it('is rare', () => {
    const big = returns(sessionSteps, (s) => s.prices.NGVS ?? 1).filter((r) => Math.abs(r) > 0.025);
    assert.ok(big.length < sessionSteps.length * 0.01);
  });
});

describe('stepsBetween', () => {
  it('returns only steps with trading, in order, ending at the target', () => {
    const steps = world.stepsBetween(utc('2026-11-09T14:00:00'), utc('2026-11-09T15:30:00'));
    assert.equal(steps.length, 18);
    assert.equal(steps.at(-1)?.at, utc('2026-11-09T15:30:00'));
  });

  it('is empty across a weekend with no trading', () => {
    assert.deepEqual(world.stepsBetween(utc('2026-11-14T00:00:00'), utc('2026-11-15T00:00:00')), []);
  });

  it('includes every market open and close', () => {
    const steps = world.stepsBetween(utc('2026-11-09T07:00:00'), utc('2026-11-10T00:00:00'));
    const times = new Set(steps.map((s) => s.at));
    for (const at of ['08:00', '14:30', '15:30', '21:00']) {
      assert.ok(times.has(utc(`2026-11-09T${at}:00`)), at);
    }
  });
});

describe('normalFrom', () => {
  it('centres on zero with a typical size of 1', () => {
    const noise = secureNoise('normal-test');
    const samples = Array.from({ length: 5_000 }, (_, i) => normalFrom(noise(String(i))));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const size = Math.sqrt(samples.reduce((a, b) => a + b * b, 0) / samples.length);
    assert.ok(Math.abs(mean) < 0.05);
    assert.ok(Math.abs(size - 1) < 0.05);
  });
});

describe('secureNoise', () => {
  it('gives eight 32-bit words, the same each time', () => {
    const noise = secureNoise('secret');
    const words = noise('key');
    assert.equal(words.length, 8);
    assert.ok(words.every((w) => Number.isInteger(w) && w >= 0 && w < 2 ** 32));
    assert.deepEqual(noise('key'), words);
  });

  it('depends on both the secret and the key', () => {
    assert.notDeepEqual(secureNoise('a')('key'), secureNoise('b')('key'));
    assert.notDeepEqual(secureNoise('a')('key'), secureNoise('a')('other'));
  });
});
