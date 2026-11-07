import { FIRST_DIVISION } from '@portfolio-league/engine';
import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { ApiError } from '../errors.ts';
import { honoursOf, lastDivision, nameIn } from '../services/profile.ts';
import type { LeagueTable } from '../store/types.ts';
import { cachedFor } from './market.ts';

export function profileRoutes(deps: Deps) {
  const routes = new Hono();
  // Finished weeks never change, so they're only read again when a new one appears.
  let saved: { latest: number | null; weeks: LeagueTable[] } | null = null;

  const finishedWeeks = async (latest: number | null) => {
    if (saved?.latest !== latest) saved = { latest, weeks: await deps.store.listFinishedWeeks() };
    return saved?.weeks ?? [];
  };

  routes.get('/players/:id/profile', async (c) => {
    const id = c.req.param('id');
    const table = await deps.store.getTable();
    const weeks = await finishedWeeks(table?.previousWeekEndsAt ?? null);
    const row = table?.rows.find((r) => r.id === id);
    const name = row?.name ?? nameIn(weeks, id) ?? (await deps.store.getPlayer(id))?.name;
    if (!name) throw new ApiError(404, 'PLAYER_NOT_FOUND', 'No such player.');

    const photos = await deps.store.getPhotos([id]);
    c.header('Cache-Control', cachedFor(30));
    return c.json({
      id,
      name,
      bot: row?.bot ?? name.endsWith('(bot)'),
      division: row?.division ?? lastDivision(weeks, id) ?? FIRST_DIVISION,
      thisWeek: row
        ? {
            rank: row.rank,
            total: table?.total ?? 0,
            score: row.score,
            returnPpm: row.returnPpm,
            maxFallPpm: row.maxFallPpm,
          }
        : null,
      honours: honoursOf(weeks, id),
      photo: photos[id] ?? null,
    });
  });

  return routes;
}
