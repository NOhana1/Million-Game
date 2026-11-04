import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { testApp } from './testing.ts';

describe('skeleton', () => {
  const app = testApp();

  it('answers the health check', async () => {
    const response = await app.request('/api/health');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, version: 'test' });
  });

  it('answers unknown routes with a JSON error', async () => {
    const response = await app.request('/api/nope');
    assert.equal(response.status, 404);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, 'NOT_FOUND');
  });
});
