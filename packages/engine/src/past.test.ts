import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { pastPrices } from './past.ts';
import { secureNoise } from './secure-noise.ts';
import { SECURITIES } from './securities.ts';
import { createWorld, WORLD_START } from './world.ts';

const noise = secureNoise('past-test');
const YEARS = 10;
const TRADING_DAYS = 240;

describe('pastPrices', () => {
  for (const security of SECURITIES) {
    it(`gives ${security.id} a believable history that joins its start price`, () => {
      const points = pastPrices(noise, security);
      assert.ok(points.length > YEARS * TRADING_DAYS);
      assert.equal(points.at(-1)?.price, security.startPrice);
      assert.ok(points.every((p) => p.at < WORLD_START && p.price > 0));
      assert.ok(points.every((p, i) => i === 0 || (points[i - 1]?.at ?? 0) < p.at));
    });
  }

  it('gives the same history every time', () => {
    const security = SECURITIES[0];
    assert.ok(security);
    assert.deepEqual(pastPrices(noise, security), pastPrices(noise, security));
  });

  it('leaves the game prices exactly as they were', () => {
    const world = createWorld(noise);
    const later = WORLD_START + 3 * 24 * 60 * 60 * 1000;
    const before = world.priceAt('TAIX', later);
    SECURITIES.forEach((security) => pastPrices(noise, security));
    assert.equal(createWorld(noise).priceAt('TAIX', later), before);
  });
});
