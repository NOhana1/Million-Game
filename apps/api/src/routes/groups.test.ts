import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { memoryStore } from '../store/memory.ts';
import { MESSAGE_GAP_MS, MOST_MEMBERS, MOST_MESSAGES } from '../store/types.ts';
import { pausedAt, testApp, TEST_WORLD } from '../testing.ts';

type Answer = { status: number; body: any };

describe('groups', () => {
  let time = 0;
  let app: ReturnType<typeof testApp>;

  const call = async (uid: string, method: string, path: string, body?: unknown): Promise<Answer> => {
    const response = await app.request(`/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const join = (uid: string) => call(uid, 'POST', '/players', { name: uid });
  const start = async (uid = 'noa') => {
    await join(uid);
    return (await call(uid, 'POST', '/groups', { name: 'The Bulls' })).body.group;
  };
  const friend = async (uid: string, code: string) => {
    await join(uid);
    return call(uid, 'POST', '/groups/join', { code });
  };
  const members = async (uid: string) =>
    (await call(uid, 'GET', '/group')).body.group.members.map((m: { id: string }) => m.id);

  beforeEach(() => {
    time = 1_000_000;
    app = testApp({ store: memoryStore(pausedAt(TEST_WORLD)), now: () => time });
  });

  it('creates a group with a code, and its creator as owner', async () => {
    const group = await start();
    assert.match(group.code, /^[A-Z2-9]{6}$/);
    const { body } = await call('noa', 'GET', '/group');
    assert.equal(body.group.name, 'The Bulls');
    assert.equal(body.group.members[0].owner, true);
  });

  it('shows no group to a player without one', async () => {
    await join('noa');
    assert.deepEqual((await call('noa', 'GET', '/group')).body, { group: null });
  });

  it('lets a friend join with the code, in any letter case', async () => {
    const { code } = await start();
    assert.equal((await friend('dan', code.toLowerCase())).status, 200);
    assert.deepEqual(await members('dan'), ['dan', 'noa']);
  });

  it('refuses a wrong code', async () => {
    await start();
    assert.equal((await friend('dan', 'ZZZZZZ')).status, 404);
  });

  it('keeps a player to one group', async () => {
    const { code } = await start();
    assert.equal((await call('noa', 'POST', '/groups', { name: 'Second' })).status, 409);
    assert.equal((await call('noa', 'POST', '/groups/join', { code })).status, 409);
  });

  it(`stops at ${MOST_MEMBERS} members`, async () => {
    const { code } = await start();
    for (let i = 1; i < MOST_MEMBERS; i += 1) assert.equal((await friend(`p${i}`, code)).status, 200);
    assert.equal((await friend('late', code)).status, 409);
  });

  it('hands the group on when its owner leaves, and deletes it when it empties', async () => {
    const group = await start();
    await friend('dan', group.code);
    assert.equal((await call('noa', 'POST', '/group/leave')).status, 200);
    const left = (await call('dan', 'GET', '/group')).body.group;
    assert.equal(left.members[0].owner, true);
    await call('dan', 'POST', '/group/leave');
    assert.equal((await friend('eve', group.code)).status, 404);
  });

  it('lets a player start again after leaving', async () => {
    await start();
    await call('noa', 'POST', '/group/leave');
    assert.equal((await call('noa', 'POST', '/groups', { name: 'Fresh' })).status, 201);
  });

  it('lets only the owner remove a member', async () => {
    const { code } = await start();
    await friend('dan', code);
    await friend('eve', code);
    assert.equal((await call('dan', 'DELETE', '/group/members/eve')).status, 403);
    assert.equal((await call('noa', 'DELETE', '/group/members/noa')).status, 404);
    assert.equal((await call('noa', 'DELETE', '/group/members/eve')).status, 200);
    assert.deepEqual(await members('noa'), ['dan', 'noa']);
    assert.deepEqual((await call('eve', 'GET', '/group')).body, { group: null });
  });

  it('never shows what a member holds', async () => {
    await start();
    const text = JSON.stringify((await call('noa', 'GET', '/group')).body);
    assert.equal(text.includes('holdings'), false);
    assert.equal(text.includes('cash'), false);
  });

  it('needs a sign in', async () => {
    assert.equal((await app.request('/api/group')).status, 401);
    assert.equal((await app.request('/api/group/chat')).status, 401);
  });

  describe('chat', () => {
    const say = (uid: string, text: unknown) => call(uid, 'POST', '/group/chat', { text });
    const read = async (uid: string) => (await call(uid, 'GET', '/group/chat')).body.messages;

    it('shares messages inside the group, under the sender’s real name', async () => {
      const { code } = await start();
      await friend('dan', code);
      assert.equal((await say('dan', 'hello')).status, 201);
      const [message] = await read('noa');
      assert.equal(message.text, 'hello');
      assert.equal(message.name, 'dan');
    });

    it('keeps a chat away from anyone outside the group', async () => {
      await start();
      await join('eve');
      assert.equal((await call('eve', 'GET', '/group/chat')).status, 404);
      assert.equal((await say('eve', 'hi')).status, 404);
    });

    it('refuses empty and overlong messages', async () => {
      await start();
      for (const text of ['   ', 'x'.repeat(301), 'bad\u0000text']) {
        assert.equal((await say('noa', text)).status, 400, JSON.stringify(text));
      }
    });

    it('slows down someone sending too fast', async () => {
      await start();
      await say('noa', 'one');
      assert.equal((await say('noa', 'two')).status, 429);
      time += MESSAGE_GAP_MS;
      assert.equal((await say('noa', 'two')).status, 201);
    });

    it(`keeps only the latest ${MOST_MESSAGES} messages`, async () => {
      await start();
      for (let i = 0; i < MOST_MESSAGES + 5; i += 1) {
        time += MESSAGE_GAP_MS;
        await say('noa', `m${i}`);
      }
      const messages = await read('noa');
      assert.equal(messages.length, MOST_MESSAGES);
      assert.equal(messages.at(-1).text, `m${MOST_MESSAGES + 4}`);
    });
  });
  describe('photos', () => {
    const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

    it('saves a photo and shows it to the group and on the profile', async () => {
      const { code } = await start();
      await friend('dan', code);
      assert.equal((await call('noa', 'PUT', '/me/photo', { photo: PHOTO })).status, 200);
      assert.deepEqual((await call('dan', 'GET', '/group/photos')).body, { photos: { noa: PHOTO } });
      assert.equal((await call('dan', 'GET', '/players/noa/profile')).body.photo, PHOTO);
      assert.equal((await call('dan', 'GET', '/players/dan/profile')).body.photo, null);
    });

    it('removes a photo', async () => {
      await start();
      await call('noa', 'PUT', '/me/photo', { photo: PHOTO });
      assert.equal((await call('noa', 'DELETE', '/me/photo')).status, 200);
      assert.deepEqual((await call('noa', 'GET', '/group/photos')).body, { photos: {} });
    });

    it('accepts only a small JPEG picture', async () => {
      await join('noa');
      for (const photo of ['https://example.com/me.jpg', 'data:image/svg+xml;base64,AAAA', `data:image/jpeg;base64,${'A'.repeat(60_000)}`]) {
        assert.equal((await call('noa', 'PUT', '/me/photo', { photo })).status, 400);
      }
    });

    it('needs a player, and a group for the group photos', async () => {
      assert.equal((await call('ghost', 'PUT', '/me/photo', { photo: PHOTO })).status, 404);
      await join('noa');
      assert.equal((await call('noa', 'GET', '/group/photos')).status, 404);
    });
  });
});
