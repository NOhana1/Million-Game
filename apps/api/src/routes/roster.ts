// Who's in the game, for the owner's admin page: real players and bots, kept apart. The game makes
// the bots, so every signed-up player is a real one. It sits behind the clock code, only reads,
// and returns names only: no emails or sign-in details, so the code can be shared with a reviewer.

import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { requireSecret } from './tick.ts';

export type RosterRow = { id: string; name: string };

const byName = (a: RosterRow, b: RosterRow) => a.name.localeCompare(b.name);

export function rosterRoutes(deps: Deps) {
  const routes = new Hono();

  routes.post('/admin/players', async (c) => {
    requireSecret(c.req.header('Authorization'), deps.clockSecret);
    // Reads every player once, plus the league's shards. Fine for the owner now and then.
    const [players, shards] = await Promise.all([deps.store.playersChangedSince(0), deps.store.getShards()]);
    const bots = shards
      .flatMap((shard) => Object.values(shard.members))
      .filter((member) => member.bot)
      .map(({ id, name }) => ({ id, name }));

    c.header('Cache-Control', 'no-store');
    return c.json({
      players: players.map(({ uid, name }) => ({ id: uid, name })).sort(byName),
      bots: bots.sort(byName),
    });
  });

  return routes;
}
