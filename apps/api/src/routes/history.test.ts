import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WORLD_START } from '@portfolio-league/engine';

import { RANGES } from '../market/quotes.ts';
import { memoryStore } from '../store/memory.ts';
import { pausedAt, testApp } from '../testing.ts';

type History = { worldTime: number; range: string; points: { at: number; price: number }[] };

const DAY_MS = 24 * 60 * 60 * 1000;
const WORLD = WORLD_START + 10 * DAY_MS + 5 * 60 * 60 * 1000;
const MOST_POINTS = 330;

const app = testApp({ store: memoryStore(pausedAt(WORLD)) });
const history = async (query: string) =>
  (await (await app.request(`/api/market/SHRN/history${query}`)).json()) as History;
const market = async () =>
  (await (await app.request('/api/market')).json()) as { securities: { id: string; price: number }[] };

describe('history ranges', () => {
  for (const range of Object.keys(RANGES)) {
    it(`${range} ends at the current price, in order, with nothing from the future`, async () => {
      const { points } = await history(`?range=${range}`);
      const price = (await market()).securities.find((s) => s.id === 'SHRN')?.price;
      assert.ok(points.length > 5 && points.length <= MOST_POINTS);
      assert.equal(points.at(-1)?.price, price);
      assert.equal(points.at(-1)?.at, WORLD);
      assert.ok(points.every((p, i) => i === 0 || (points[i - 1]?.at ?? 0) < p.at));
    });
  }

  it('reaches further back for longer ranges', async () => {
    const first = async (range: string) => (await history(`?range=${range}`)).points[0]?.at ?? 0;
    assert.ok((await first('ALL')) < (await first('5Y')));
    assert.ok((await first('5Y')) < (await first('1Y')));
    assert.ok((await first('1Y')) < (await first('1M')));
  });

  it('refuses an unknown range', async () => {
    assert.equal((await app.request('/api/market/SHRN/history?range=9Y')).status, 400);
  });

  it('still answers without a range', async () => {
    assert.equal((await history('')).points.at(-1)?.at, WORLD);
  });

  it('gives every security a small line for the market list', async () => {
    const sparks = (await (await app.request('/api/market/sparks')).json()) as Record<string, number[]>;
    assert.equal(Object.keys(sparks).length, 20);
    assert.ok(Object.values(sparks).every((line) => line.length > 5));
  });
});
