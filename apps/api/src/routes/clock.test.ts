import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { advancedTo, type Clock, paused, withSpeed, worldTime } from '../clock.ts';
import { memoryStore } from '../store/memory.ts';
import { testApp, TEST_WORLD } from '../testing.ts';

const running: Clock = { anchorWorld: 1000, anchorReal: 0, speed: 7, paused: false };
const CLOSE = Date.UTC(2026, 10, 9, 15, 30);

describe('clock changes', () => {
  it('jumps forward, then keeps running from there', () => {
    const moved = advancedTo(running, 5000, 100);
    assert.equal(worldTime(moved, 100), 5000);
    assert.equal(worldTime(moved, 110), 5070);
  });

  it('never moves backwards', () => {
    assert.equal(worldTime(advancedTo(running, 500, 100), 100), 1700);
  });

  it('holds its time through a pause and a resume', () => {
    const stopped = paused(running, 100, true);
    assert.equal(worldTime(stopped, 5000), 1700);
    const resumed = paused(stopped, 5000, false);
    assert.equal(worldTime(resumed, 5000), 1700);
    assert.equal(worldTime(resumed, 5010), 1770);
  });

  it('does not jump when the speed changes', () => {
    const faster = withSpeed(running, 100, 60);
    assert.equal(worldTime(faster, 100), 1700);
    assert.equal(worldTime(faster, 101), 1760);
  });
});

describe('/admin/clock', () => {
  const setup = () => {
    let realNow = 1000;
    const store = memoryStore({ anchorWorld: TEST_WORLD, anchorReal: 1000, speed: 7, paused: false });
    const app = testApp({ store, now: () => realNow });
    const send = (body: unknown, secret = 'clock-secret') =>
      app.request('/api/admin/clock', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    return { app, store, send, wait: (ms: number) => (realNow += ms) };
  };
  const world = async (response: Response) => ((await response.json()) as { worldTime: number }).worldTime;

  it('refuses a wrong secret, including the tick secret, and changes nothing', async () => {
    const { store, send } = setup();
    const before = await store.getClock(0);
    assert.equal((await send({ action: 'pause' }, 'wrong')).status, 401);
    assert.equal((await send({ action: 'pause' }, 'test-secret')).status, 401);
    assert.deepEqual(await store.getClock(0), before);
  });

  it('does not let the clock secret run /tick', async () => {
    const { app } = setup();
    const response = await app.request('/api/tick', {
      method: 'POST',
      headers: { Authorization: 'Bearer clock-secret' },
    });
    assert.equal(response.status, 401);
  });

  it('treats a double click on the same target as one', async () => {
    const { send } = setup();
    const target = TEST_WORLD + 3_600_000;
    assert.equal(await world(await send({ action: 'advance', to: target })), target);
    assert.equal(await world(await send({ action: 'advance', to: target })), target);
  });

  it('jumps to the next market event', async () => {
    const { send } = setup();
    const moved = await world(await send({ action: 'advance', to: 'next' }));
    assert.equal(moved, Date.UTC(2026, 10, 9, 14, 30)); // the US open
  });

  it('fills orders that became due in the jump', async () => {
    const { app, send } = setup();
    const headers = { Authorization: 'Bearer noa', 'Content-Type': 'application/json' };
    await app.request('/api/players', { method: 'POST', headers, body: '{"name":"Noa"}' });
    await app.request('/api/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: randomUUID(), securityId: 'TAIX', side: 'buy', amount: 100_000 }),
    });
    const response = await send({ action: 'advance', to: CLOSE });
    const { settlement } = (await response.json()) as { settlement: { filled: number } };
    assert.equal(settlement.filled, 1);
  });

  it('pauses and resumes', async () => {
    const { send, wait, app } = setup();
    await send({ action: 'pause' });
    wait(10_000);
    const stopped = (await (await app.request('/api/world')).json()) as { worldTime: number };
    assert.equal(stopped.worldTime, TEST_WORLD);
    await send({ action: 'resume' });
    wait(1_000);
    const moving = (await (await app.request('/api/world')).json()) as { worldTime: number };
    assert.equal(moving.worldTime, TEST_WORLD + 7_000);
  });

  it('limits the speed and rejects bad requests', async () => {
    const { send } = setup();
    assert.equal((await send({ action: 'speed', speed: 60 })).status, 200);
    for (const body of [
      { action: 'speed', speed: 61 },
      { action: 'speed', speed: 0 },
      { action: 'advance' },
      { action: 'advance', to: -5 },
      { action: 'rewind' },
    ]) {
      assert.equal((await send(body)).status, 400, JSON.stringify(body));
    }
  });
});
