import assert from 'node:assert/strict';
import { test } from 'node:test';

test('deliberately broken, to prove CI blocks merges', () => {
  assert.equal(1, 2);
});
