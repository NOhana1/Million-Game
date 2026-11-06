import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { memoryStore } from '../store/memory.ts';
import type { LeagueTable } from '../store/types.ts';
import { pausedAt, TEST_WORLD, testApp } from '../testing.ts';

// As saved before divisions existed, so the row has no division.
const oldTable = {
  updatedAt: 1,
  weekEndsAt: 2,
  previousWeekEndsAt: null,
  total: 1,
  rows: [{ id: 'a', name: 'A', rank: 1, score: 100 }],
} as unknown as LeagueTable;

describe('league routes', () => {
  const store = memoryStore(pausedAt(TEST_WORLD));
  const app = testApp({
    store: { ...store, getTable: async () => oldTable, getFinishedWeek: async () => oldTable },
  });

  for (const path of ['/api/league', '/api/league/weeks/2']) {
    it(`puts old rows in the first division on ${path}`, async () => {
      const table = (await (await app.request(path)).json()) as LeagueTable;
      assert.equal(table.rows[0]?.division, 'bronze');
    });
  }
});
