import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { ApiError } from '../errors.ts';
import { cachedFor } from './market.ts';

export function leagueRoutes(deps: Deps) {
  const routes = new Hono();

  routes.get('/league', async (c) => {
    c.header('Cache-Control', cachedFor(30));
    const table = await deps.store.getTable();
    return c.json(
      table ?? {
        updatedAt: null,
        weekEndsAt: null,
        previousWeekEndsAt: null,
        total: 0,
        rows: [],
        indexes: {},
      },
    );
  });

  routes.get('/league/weeks/:endsAt', async (c) => {
    const endsAt = Number(c.req.param('endsAt'));
    const table = Number.isSafeInteger(endsAt) ? await deps.store.getFinishedWeek(endsAt) : null;
    if (!table) throw new ApiError(404, 'UNKNOWN_WEEK', 'No such week.');
    c.header('Cache-Control', cachedFor(300));
    return c.json(table);
  });

  return routes;
}
