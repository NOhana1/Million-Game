// Adding and removing bots by hand, from the owner's admin page, behind the admin code. Bots live
// only in the league, so both are league edits, refused while the league is updating.

import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { worldTime } from '../clock.ts';
import { ApiError } from '../errors.ts';
import { quotesAt } from '../market/quotes.ts';
import { newBot } from '../services/bots.ts';
import { firstShards } from '../services/league.ts';
import { shardsWithout, tableWithout } from '../store/player-removal.ts';
import type { Member } from '../store/types.ts';
import { requireSecret } from './tick.ts';

const SHARD_SIZE = 1000; // the same limit as the league's own

const busy = () => new ApiError(409, 'BUSY', 'The league is updating. Try again in a minute.');

export function botAdminRoutes(deps: Deps) {
  const routes = new Hono();

  routes.post('/admin/bots', async (c) => {
    requireSecret(c.req.header('Authorization'), deps.clockSecret);
    const realNow = deps.now();
    const world = worldTime(await deps.store.getClock(realNow), realNow);
    let added: Member | null = null;
    const result = await deps.store.editLeague(realNow, (stored) => {
      // Before the first market open there's no league yet: start it with the usual bots too.
      const shards = stored.length > 0 ? stored : firstShards(world);
      const members = shards.flatMap((shard) => Object.values(shard.members));
      const bot = newBot(members, world, quotesAt(deps.feed, world));
      let shard = shards.find((s) => Object.keys(s.members).length < SHARD_SIZE);
      if (!shard) {
        shard = { id: String(shards.length), members: {} };
        shards.push(shard);
      }
      shard.members[bot.id] = bot;
      added = bot;
      // A brand-new league saves every shard; otherwise only the one that changed.
      return { shards: stored.length > 0 ? [shard] : shards, table: null };
    });
    if (result === 'busy') throw busy();
    const bot = added as Member | null;
    if (!bot) throw new Error('The bot wasn’t added.');
    return c.json({ bot: { id: bot.id, name: bot.name } }, 201);
  });

  routes.delete('/admin/bots/:id', async (c) => {
    requireSecret(c.req.header('Authorization'), deps.clockSecret);
    const id = c.req.param('id');
    const result = await deps.store.editLeague(deps.now(), (shards, table) => {
      const changed = shardsWithout(shards, id, true);
      if (changed.length === 0) return null;
      return { shards: changed, table: tableWithout(table, id, true) };
    });
    if (result === 'busy') throw busy();
    if (result === 'unchanged') throw new ApiError(404, 'NO_BOT', 'There’s no such bot.');
    return c.json({ deleted: true });
  });

  return routes;
}
