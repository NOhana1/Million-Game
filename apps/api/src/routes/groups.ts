// Friends groups and their chat. A group shows results only, never what anyone holds. Every call
// needs a sign in, and a player only ever reaches their own group.

import { randomInt, randomUUID } from 'node:crypto';

import { FIRST_DIVISION } from '@portfolio-league/engine';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Deps } from '../app.ts';
import { type AuthEnv, requireUser } from '../auth.ts';
import { readBody } from '../body.ts';
import { ApiError } from '../errors.ts';
import type { Group, GroupChange, GroupProblem, LeagueTable } from '../store/types.ts';

const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]+$/u;
const NewGroup = z.object({ name: z.string().trim().min(3).max(30).regex(NO_CONTROL_CHARACTERS) });
const Join = z.object({ code: z.string().trim().toUpperCase().length(6) });
const Message = z.object({ text: z.string().trim().min(1).max(300).regex(NO_CONTROL_CHARACTERS) });

const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0 or 1, which look alike
const CODE_LENGTH = 6;
const CODE_TRIES = 5;

const PROBLEMS: Record<GroupProblem, [ApiError['status'], string]> = {
  NO_PLAYER: [404, 'Create a player first.'],
  IN_GROUP: [409, 'You’re already in a group.'],
  NO_GROUP: [404, 'That group doesn’t exist.'],
  GROUP_FULL: [409, 'That group is full.'],
  NOT_OWNER: [403, 'Only the group’s owner can do that.'],
  NOT_MEMBER: [404, 'That player isn’t in your group.'],
  TOO_FAST: [429, 'Slow down a little.'],
};

function done(change: GroupChange) {
  if ('problem' in change) {
    const [status, message] = PROBLEMS[change.problem];
    throw new ApiError(status, change.problem, message);
  }
  return change.group;
}

const newCode = () =>
  Array.from({ length: CODE_LENGTH }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');

/** The group with this week's results beside each member, best first. */
function standings(group: Group, table: LeagueTable | null) {
  const members = group.members.map((member) => {
    const row = table?.rows.find((r) => r.id === member.id);
    return {
      id: member.id,
      name: member.name,
      joinedAt: member.joinedAt, // gives each member a lasting color in the chat
      owner: member.id === group.ownerId,
      division: row?.division ?? FIRST_DIVISION,
      rank: row?.rank ?? null,
      score: row?.score ?? null,
      returnPpm: row?.returnPpm ?? null,
    };
  });
  members.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name));
  return { id: group.id, name: group.name, code: group.code, members };
}

export function groupRoutes(deps: Deps) {
  const routes = new Hono<AuthEnv>();
  const signedIn = requireUser(deps.verifyToken);
  const { store } = deps;

  const myGroupId = async (uid: string) => {
    const player = await store.getPlayer(uid);
    if (!player) throw new ApiError(404, 'NO_PLAYER', 'Create a player first.');
    return player.groupId ?? null;
  };

  const unusedCode = async () => {
    for (let tries = 0; tries < CODE_TRIES; tries += 1) {
      const code = newCode();
      if (!(await store.findGroupByCode(code))) return code;
    }
    throw new ApiError(503, 'TRY_AGAIN', 'Please try again.');
  };

  routes.get('/group', signedIn, async (c) => {
    const groupId = await myGroupId(c.get('uid'));
    const group = groupId ? await store.getGroup(groupId) : null;
    return c.json({ group: group ? standings(group, await store.getTable()) : null });
  });

  routes.post('/groups', signedIn, async (c) => {
    const { name } = await readBody(c, NewGroup);
    const uid = c.get('uid');
    const player = await store.getPlayer(uid);
    if (!player) throw new ApiError(404, 'NO_PLAYER', 'Create a player first.');
    const now = deps.now();
    const group = done(
      await store.createGroup({
        id: randomUUID(),
        name,
        code: await unusedCode(),
        ownerId: uid,
        createdAt: now,
        members: [{ id: uid, name: player.name, joinedAt: now }],
      }),
    );
    return c.json({ group }, 201);
  });

  routes.post('/groups/join', signedIn, async (c) => {
    const { code } = await readBody(c, Join);
    return c.json({ group: done(await store.joinGroup(c.get('uid'), code, deps.now())) });
  });

  routes.post('/group/leave', signedIn, async (c) => {
    done(await store.leaveGroup(c.get('uid')));
    return c.json({ left: true });
  });

  routes.delete('/group/members/:id', signedIn, async (c) => {
    done(await store.removeMember(c.get('uid'), c.req.param('id')));
    return c.json({ removed: true });
  });

  routes.get('/group/chat', signedIn, async (c) => {
    const groupId = await myGroupId(c.get('uid'));
    if (!groupId) throw new ApiError(404, 'NO_GROUP', 'Join a group first.');
    return c.json({ messages: await store.getMessages(groupId) });
  });

  // Fetched once when the chat opens, not on every refresh, since each photo is a database read.
  routes.get('/group/photos', signedIn, async (c) => {
    const groupId = await myGroupId(c.get('uid'));
    const group = groupId ? await store.getGroup(groupId) : null;
    if (!group) throw new ApiError(404, 'NO_GROUP', 'Join a group first.');
    c.header('Cache-Control', 'private, max-age=30');
    return c.json({ photos: await store.getPhotos(group.members.map((m) => m.id)) });
  });

  routes.post('/group/chat', signedIn, async (c) => {
    const { text } = await readBody(c, Message);
    done(await store.addMessage(c.get('uid'), { id: randomUUID(), text, at: deps.now() }));
    return c.json({ sent: true }, 201);
  });

  return routes;
}
