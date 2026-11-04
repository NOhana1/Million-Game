import assert from 'node:assert/strict';
import { test } from 'node:test';

import { START_CASH_ILS } from './index.ts';

test('players start with one million shekels', () => {
  assert.equal(START_CASH_ILS, 1_000_000);
});
