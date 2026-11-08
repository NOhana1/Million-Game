import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { categoryOf, counter, LIMITS, type Limits } from './rate-limit.ts';
import { memoryStore } from './store/memory.ts';
import { pausedAt, TEST_WORLD, testApp } from './testing.ts';

type Problem = { error: { code: string; message: string; retryAfter?: number } };

const SMALL: Limits = {
  read: { perAddress: 6, perPlayer: 4 },
  costly: { perAddress: 6, perPlayer: 3 },
  write: { perAddress: 6, perPlayer: 2 },
  signup: { perAddress: 2, perPlayer: 2 },
  secret: { perAddress: 2, perPlayer: 2 },
};

const json = { 'Content-Type': 'application/json' };
const as = (uid: string, ip = '1.1.1.1') => ({ Authorization: `Bearer ${uid}`, 'x-real-ip': ip });

/** An app with the given limits and a clock the test can move. */
function setup(limits: Limits = SMALL) {
  let realNow = 0;
  const app = testApp({ limits, now: () => realNow });
  return {
    app,
    later: (ms: number) => {
      realNow += ms;
    },
    get: (path: string, headers: Record<string, string> = {}) => app.request(path, { headers }),
    join: (uid: string, ip?: string) =>
      app.request('/api/players', {
        method: 'POST',
        headers: { ...as(uid, ip), ...json },
        body: JSON.stringify({ name: `Player ${uid}` }),
      }),
    goal: (uid: string, ip?: string) =>
      app.request('/api/me/goal', {
        method: 'PUT',
        headers: { ...as(uid, ip), ...json },
        body: JSON.stringify({ amount: 2_000_000_00 }),
      }),
  };
}

describe('request categories', () => {
  it('sorts every kind of request', () => {
    assert.equal(categoryOf('GET', '/api/market'), 'read');
    assert.equal(categoryOf('GET', '/api/market/TLV-1/history'), 'read');
    assert.equal(categoryOf('GET', '/api/league'), 'read');
    assert.equal(categoryOf('GET', '/api/me'), 'read');
    assert.equal(categoryOf('GET', '/api/me/orders'), 'costly');
    assert.equal(categoryOf('GET', '/api/me/history'), 'costly');
    assert.equal(categoryOf('GET', '/api/players/noa/profile'), 'read');
    assert.equal(categoryOf('POST', '/api/orders'), 'write');
    assert.equal(categoryOf('PUT', '/api/me/watchlist'), 'write');
    assert.equal(categoryOf('DELETE', '/api/me/photo'), 'write');
    assert.equal(categoryOf('POST', '/api/group/chat'), 'write');
    assert.equal(categoryOf('POST', '/api/players'), 'signup');
    assert.equal(categoryOf('POST', '/api/admin/clock'), 'secret');
    assert.equal(categoryOf('POST', '/api/tick'), 'secret');
    assert.equal(categoryOf('GET', '/api/health'), null);
  });

  it('allows more cheap reads than costly ones, and fewest sign-ups and secret guesses', () => {
    assert.ok(LIMITS.read.perPlayer > LIMITS.costly.perPlayer);
    assert.ok(LIMITS.read.perPlayer > LIMITS.write.perPlayer);
    assert.ok(LIMITS.write.perPlayer > LIMITS.signup.perPlayer);
    assert.ok(LIMITS.read.perAddress >= LIMITS.read.perPlayer);
  });
});

describe('the counter', () => {
  it('allows up to the limit, then says how long to wait, then resets', () => {
    let now = 0;
    const take = counter(() => now);
    for (let i = 0; i < 3; i += 1) assert.equal(take('k', 3), 0);
    assert.equal(take('k', 3), 60);
    now = 45_500;
    assert.equal(take('k', 3), 15);
    now = 60_000;
    assert.equal(take('k', 3), 0);
  });

  it('keeps keys apart', () => {
    const take = counter(() => 0);
    assert.equal(take('a', 1), 0);
    assert.equal(take('b', 1), 0);
    assert.notEqual(take('a', 1), 0);
  });
});

describe('rate limits', () => {
  it('answers 429 with a retry time once a player reads too much', async () => {
    const { get } = setup();
    for (let i = 0; i < 4; i += 1) {
      assert.equal((await get('/api/market', as('noa'))).status, 200);
    }
    const blocked = await get('/api/market', as('noa'));
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('Retry-After'), '60');
    const body = (await blocked.json()) as Problem;
    assert.equal(body.error.code, 'RATE_LIMITED');
    assert.equal(body.error.retryAfter, 60);
    assert.match(body.error.message, /Try again in 60 seconds/);
  });

  it('lets the player back in after the wait', async () => {
    const { get, later } = setup();
    for (let i = 0; i < 4; i += 1) await get('/api/market', as('noa'));
    assert.equal((await get('/api/market', as('noa'))).status, 429);
    later(60_000);
    assert.equal((await get('/api/market', as('noa'))).status, 200);
  });

  it('counts each player on their own', async () => {
    const { get } = setup();
    for (let i = 0; i < 4; i += 1) await get('/api/market', as('noa', '1.1.1.1'));
    assert.equal((await get('/api/market', as('noa', '1.1.1.1'))).status, 429);
    assert.equal((await get('/api/market', as('dan', '2.2.2.2'))).status, 200);
  });

  it('counts reads and writes apart, so browsing never blocks an order', async () => {
    const { get, join, goal } = setup();
    assert.equal((await join('noa')).status, 201);
    for (let i = 0; i < 4; i += 1) await get('/api/market', as('noa'));
    assert.equal((await get('/api/market', as('noa'))).status, 429);
    assert.equal((await goal('noa')).status, 200);
  });

  it('allows fewer writes than reads', async () => {
    const { join, goal } = setup();
    await join('noa');
    assert.equal((await goal('noa')).status, 200);
    assert.equal((await goal('noa')).status, 200);
    assert.equal((await goal('noa')).status, 429);
  });

  it('blocks changing tokens from one address', async () => {
    const { get } = setup();
    for (let i = 0; i < 6; i += 1) {
      assert.equal((await get('/api/market', as(`fake-${i}`, '9.9.9.9'))).status, 200);
    }
    assert.equal((await get('/api/market', as('fake-6', '9.9.9.9'))).status, 429);
  });

  it('limits signed-out readers by address', async () => {
    const { get } = setup();
    for (let i = 0; i < 6; i += 1) await get('/api/league', { 'x-real-ip': '5.5.5.5' });
    assert.equal((await get('/api/league', { 'x-real-ip': '5.5.5.5' })).status, 429);
    assert.equal((await get('/api/league', { 'x-real-ip': '6.6.6.6' })).status, 200);
  });

  it('limits sign-ups per address', async () => {
    const { join } = setup();
    assert.equal((await join('a', '7.7.7.7')).status, 201);
    assert.equal((await join('b', '7.7.7.7')).status, 201);
    assert.equal((await join('c', '7.7.7.7')).status, 429);
  });

  it('stops guessing the clock code, even with the right code after', async () => {
    const { app } = setup();
    const guess = (code: string) =>
      app.request('/api/admin/clock', {
        method: 'POST',
        headers: { Authorization: `Bearer ${code}`, 'x-real-ip': '8.8.8.8', ...json },
        body: JSON.stringify({ action: 'pause' }),
      });
    assert.equal((await guess('wrong-1')).status, 401);
    assert.equal((await guess('wrong-2')).status, 401);
    assert.equal((await guess('clock-secret')).status, 429);
  });

  it('caps a burst of wrong codes sent at once, then lets the right code in after a minute', async () => {
    const { app, later } = setup({ ...SMALL, secret: { perAddress: 10, perPlayer: 10 } });
    const guess = (code: string) =>
      app.request('/api/admin/clock', {
        method: 'POST',
        headers: { Authorization: `Bearer ${code}`, 'x-real-ip': '4.4.4.4', ...json },
        body: JSON.stringify({ action: 'resume' }),
      });
    const burst = await Promise.all(Array.from({ length: 20 }, (_, i) => guess(`wrong-${i}`)));
    const statuses = burst.map((response) => response.status);
    assert.equal(statuses.filter((s) => s === 401).length, 10);
    assert.equal(statuses.filter((s) => s === 429).length, 10);
    later(60_000);
    assert.equal((await guess('clock-secret')).status, 200);
  });

  it('never limits the right code, however often it comes', async () => {
    const { app } = setup();
    for (let i = 0; i < 8; i += 1) {
      const response = await app.request('/api/admin/clock', {
        method: 'POST',
        headers: { Authorization: 'Bearer clock-secret', 'x-real-ip': '9.9.9.9', ...json },
        body: JSON.stringify({ action: 'resume' }),
      });
      assert.equal(response.status, 200);
    }
  });

  it('never limits the health check', async () => {
    const { get } = setup();
    for (let i = 0; i < 20; i += 1) assert.equal((await get('/api/health')).status, 200);
  });

  it('still refuses a bad token with 401, not a limit', async () => {
    const { get } = setup();
    assert.equal((await get('/api/me', as('invalid'))).status, 401);
  });
});

describe('normal play with the real limits', () => {
  it('a long busy session never hits a limit', async () => {
    const { app, get, join, later } = setup(LIMITS);
    assert.equal((await join('noa')).status, 201);
    const market = (await (await get('/api/market', as('noa'))).json()) as {
      securities: { id: string }[];
    };
    const ids = market.securities.map((s) => s.id);

    // Ten minutes with the app open, every poll the app makes, plus browsing every security
    // twice a minute and a few orders.
    for (let minute = 0; minute < 10; minute += 1) {
      const calls: (Response | Promise<Response>)[] = [];
      for (let i = 0; i < 12; i += 1) calls.push(get('/api/world', as('noa')), get('/api/market', as('noa')));
      for (let i = 0; i < 4; i += 1) calls.push(get('/api/me', as('noa')), get('/api/me/orders', as('noa')));
      calls.push(get('/api/league', as('noa')), get('/api/league', as('noa')));
      for (const range of ['ALL', '1W', '1M']) calls.push(get(`/api/me/history?range=${range}`, as('noa')));
      for (const id of [...ids, ...ids]) calls.push(get(`/api/market/${id}/history?range=1D`, as('noa')));
      for (let i = 0; i < 3; i += 1) {
        calls.push(
          app.request('/api/orders', {
            method: 'POST',
            headers: { ...as('noa'), ...json },
            body: JSON.stringify({
              id: crypto.randomUUID(),
              securityId: ids[i],
              side: 'buy',
              amount: 1_000_00,
            }),
          }),
        );
      }
      const statuses = (await Promise.all(calls)).map((r) => r.status);
      assert.ok(!statuses.includes(429), `minute ${minute} hit a limit`);
      later(60_000);
    }
  });
});

describe('an office sharing one address, with the real limits', () => {
  it('five colleagues chatting and browsing for five minutes are never limited', async () => {
    const { app, get, join, later } = setup(LIMITS);
    const office = '10.0.0.1';
    const people = ['noa', 'dan', 'maya', 'lior', 'tal'];
    const send = (uid: string, method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { ...as(uid, office), ...json },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    for (const uid of people) assert.equal((await join(uid, office)).status, 201);
    const created = await send('noa', 'POST', '/api/groups', { name: 'The Office' });
    const { group } = (await created.json()) as { group: { code: string } };
    for (const uid of people.slice(1)) {
      assert.equal((await send(uid, 'POST', '/api/groups/join', { code: group.code })).status, 200);
    }
    const market = (await (await get('/api/market', as('noa', office))).json()) as {
      securities: { id: string }[];
    };
    const ids = market.securities.map((s) => s.id);

    for (let minute = 0; minute < 5; minute += 1) {
      const calls: (Response | Promise<Response>)[] = [];
      for (const uid of people) {
        const read = (path: string) => calls.push(get(path, as(uid, office)));
        for (let i = 0; i < 12; i += 1) read('/api/world'), read('/api/market');
        for (let i = 0; i < 4; i += 1) read('/api/me'), read('/api/me/orders');
        for (let i = 0; i < 8; i += 1) read('/api/group/chat');
        read('/api/group'), read('/api/group'), read('/api/group/photos');
        read('/api/league'), read('/api/league');
        for (const id of ids) read(`/api/market/${id}/history?range=1D`);
      }
      const statuses = (await Promise.all(calls)).map((r) => r.status);
      assert.ok(!statuses.includes(429), `minute ${minute}: reads were limited`);

      // Everyone sends a message every 15 seconds.
      for (let round = 0; round < 4; round += 1) {
        later(15_000);
        for (const uid of people) {
          const said = await send(uid, 'POST', '/api/group/chat', { text: `hi ${round}` });
          assert.notEqual(said.status, 429, `minute ${minute}: ${uid} was limited`);
        }
      }
    }
  });
});

const RANGES = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'ALL'];

const securityIds = async (app: ReturnType<typeof testApp>) =>
  ((await (await app.request('/api/market')).json()) as { securities: { id: string }[] }).securities.map(
    (s) => s.id,
  );

describe('costly reads', () => {
  const order = (app: ReturnType<typeof testApp>, uid: string, securityId: string) =>
    app.request('/api/orders', {
      method: 'POST',
      headers: { ...as(uid), ...json },
      body: JSON.stringify({ id: crypto.randomUUID(), securityId, side: 'buy', amount: 1_000_00 }),
    });

  it('a busy minute on the portfolio screen is never limited', async () => {
    const { app, get, join } = setup(LIMITS);
    await join('noa');
    const ids = (await securityIds(app)).slice(0, 5);
    const statuses: number[] = [];
    // Every chart range once (the browser keeps each for 30 seconds, so a second look is free),
    // five orders that each refresh the order list, the once-a-minute check, and the chart
    // reloading twice after fills.
    for (const range of RANGES) statuses.push((await get(`/api/me/history?range=${range}`, as('noa'))).status);
    for (const id of ids) {
      statuses.push((await order(app, 'noa', id)).status);
      statuses.push((await get('/api/me/orders', as('noa'))).status);
    }
    statuses.push((await get('/api/me/orders', as('noa'))).status);
    statuses.push((await get('/api/me/history?range=ALL', as('noa'))).status);
    statuses.push((await get('/api/me/history?range=ALL', as('noa'))).status);
    assert.ok(!statuses.includes(429), `limited: ${statuses.join(',')}`);
  });

  it('stops a player who keeps asking for the order list, but not their other reads', async () => {
    const { get, join } = setup(LIMITS);
    await join('noa');
    for (let i = 0; i < LIMITS.costly.perPlayer; i += 1) {
      assert.equal((await get('/api/me/orders', as('noa'))).status, 200);
    }
    const blocked = await get('/api/me/history', as('noa'));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('Retry-After')) > 0);
    assert.equal((await get('/api/market', as('noa'))).status, 200);
    assert.equal((await get('/api/me', as('noa'))).status, 200);
  });

  it('stops many accounts on one address from adding up', async () => {
    const { get } = setup(LIMITS);
    const ip = '4.4.4.4';
    let allowed = 0;
    let limited = 0;
    for (let account = 0; account < 10; account += 1) {
      for (let i = 0; i < LIMITS.costly.perPlayer; i += 1) {
        const status = (await get('/api/me/orders', as(`bot-${account}`, ip))).status;
        if (status === 429) limited += 1;
        else allowed += 1;
      }
    }
    assert.equal(allowed, LIMITS.costly.perAddress);
    assert.equal(limited, 10 * LIMITS.costly.perPlayer - LIMITS.costly.perAddress);
  });
});

describe('portfolio history reuses the order list', () => {
  it('reads the orders once, until the player places an order', async () => {
    const store = memoryStore(pausedAt(TEST_WORLD));
    let orderReads = 0;
    const listOrders = store.listOrders.bind(store);
    store.listOrders = async (...args) => {
      orderReads += 1;
      return listOrders(...args);
    };
    const app = testApp({ store });
    const get = (path: string) => app.request(path, { headers: as('noa') });
    await app.request('/api/players', {
      method: 'POST',
      headers: { ...as('noa'), ...json },
      body: JSON.stringify({ name: 'Noa' }),
    });

    for (const range of RANGES) assert.equal((await get(`/api/me/history?range=${range}`)).status, 200);
    assert.equal(orderReads, 1, 'eight chart ranges should read the orders once');

    const placed = await app.request('/api/orders', {
      method: 'POST',
      headers: { ...as('noa'), ...json },
      body: JSON.stringify({ id: crypto.randomUUID(), securityId: (await securityIds(app))[0], side: 'buy', amount: 1_000_00 }),
    });
    assert.equal(placed.status, 201);
    await get('/api/me/history?range=ALL');
    assert.equal(orderReads, 2, 'a new order should be read again');
    await get('/api/me/history?range=1W');
    assert.equal(orderReads, 2);
  });

  it('answers 404 before reading anything for someone with no player', async () => {
    const app = testApp();
    const response = await app.request('/api/me/history', { headers: as('ghost') });
    assert.equal(response.status, 404);
  });
});
