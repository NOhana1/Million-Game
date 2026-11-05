// Acts like a cheating browser against firestore.rules. Needs the Firestore emulator.
// It talks to the emulator's REST API, so it adds no dependency.

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const project = process.env.GCLOUD_PROJECT ?? 'demo-portfolio-league';
const documents = `http://${host}/v1/projects/${project}/databases/(default)/documents`;

const base64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

// The emulator accepts unsigned tokens, so a test can sign in as anyone.
const tokenFor = (uid: string) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${project}`,
    aud: project,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    sub: uid,
    user_id: uid,
    firebase: { sign_in_provider: 'password', identities: {} },
  };
  return `${base64({ alg: 'none', typ: 'JWT' })}.${base64(payload)}.`;
};

const call = async (method: string, path: string, token?: string, cash?: number) => {
  const response = await fetch(`${documents}/${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(cash === undefined
      ? {}
      : { body: JSON.stringify({ fields: { cash: { integerValue: String(cash) } } }) }),
  });
  return response.status;
};

const ALLOWED = 200;
const DENIED = 403;

describe('firestore rules', { skip: !host }, () => {
  const alice = tokenFor('alice');
  const bob = tokenFor('bob');

  before(async () => {
    // "owner" is the emulator's admin token, and it skips the rules, like our server.
    for (const path of ['players/alice', 'players/alice/orders/o1', 'world/clock']) {
      assert.equal(await call('PATCH', path, 'owner', 1), ALLOWED);
    }
  });

  it('lets players read their own data', async () => {
    assert.equal(await call('GET', 'players/alice', alice), ALLOWED);
    assert.equal(await call('GET', 'players/alice/orders/o1', alice), ALLOWED);
  });

  it('hides a player from other players and from visitors', async () => {
    assert.equal(await call('GET', 'players/alice', bob), DENIED);
    assert.equal(await call('GET', 'players/alice/orders/o1', bob), DENIED);
    assert.equal(await call('GET', 'players/alice'), DENIED);
  });

  it('stops players changing their own cash or orders', async () => {
    assert.equal(await call('PATCH', 'players/alice', alice, 1_000_000_000), DENIED);
    assert.equal(await call('PATCH', 'players/alice/orders/o2', alice, 1), DENIED);
    assert.equal(await call('DELETE', 'players/alice/orders/o1', alice), DENIED);
    assert.equal(await call('DELETE', 'players/alice', alice), DENIED);
  });

  it('stops anyone creating a player from a browser', async () => {
    assert.equal(await call('PATCH', 'players/bob', bob, 1), DENIED);
  });

  it('denies everything that is not listed, such as the world', async () => {
    assert.equal(await call('GET', 'world/clock', alice), DENIED);
    assert.equal(await call('PATCH', 'world/clock', alice, 1), DENIED);
  });
});
