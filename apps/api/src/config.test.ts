import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readConfig } from './config.ts';

const account = JSON.stringify({
  project_id: 'demo',
  client_email: 'api@demo.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
});
const seed = 'a'.repeat(32);

describe('settings', () => {
  it('reads valid settings', () => {
    const config = readConfig({ FIREBASE_SERVICE_ACCOUNT: account, WORLD_SEED: seed, TICK_SECRET: seed, CLOCK_SECRET: seed });
    assert.equal(config.FIREBASE_SERVICE_ACCOUNT.project_id, 'demo');
  });

  it('names what is missing', () => {
    assert.throws(() => readConfig({}), /FIREBASE_SERVICE_ACCOUNT.*WORLD_SEED.*TICK_SECRET.*CLOCK_SECRET/);
  });

  it('refuses a short seed, which could be guessed', () => {
    assert.throws(
      () => readConfig({ FIREBASE_SERVICE_ACCOUNT: account, WORLD_SEED: 'short', TICK_SECRET: seed, CLOCK_SECRET: seed }),
      /WORLD_SEED/,
    );
  });

  it('never prints a secret in its error', () => {
    const secret = 'SECRET-VALUE-not-json';
    assert.throws(
      () => readConfig({ FIREBASE_SERVICE_ACCOUNT: secret, WORLD_SEED: seed, TICK_SECRET: seed, CLOCK_SECRET: seed }),
      (error: Error) => !error.message.includes(secret),
    );
  });
});
