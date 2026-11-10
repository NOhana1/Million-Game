// Who's in the game, for the owner's admin page: real players and bots, kept apart. The game makes
// the bots, so every signed-up player is a real one. It sits behind the admin code and returns
// names only: no emails or sign-in details. The same code can also delete a real player, so
// anyone given the admin code can remove players too.

import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { ApiError } from '../errors.ts';
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

  // Deletes the player's game data first, then their sign-in, which frees the email to sign up
  // again. Each step is safe to repeat, so if the second fails, deleting again finishes the job.
  routes.delete('/admin/players/:id', async (c) => {
    requireSecret(c.req.header('Authorization'), deps.clockSecret);
    const uid = c.req.param('id');
    if (uid.startsWith('bot-')) throw new ApiError(400, 'BOT', 'Bots can’t be deleted.');
    if ((await deps.store.deletePlayer(uid, deps.now())) === 'busy') {
      throw new ApiError(409, 'BUSY', 'The league is updating. Try again in a minute.');
    }
    await deps.deleteAccount?.(uid);
    return c.json({ deleted: true });
  });

  return routes;
}
