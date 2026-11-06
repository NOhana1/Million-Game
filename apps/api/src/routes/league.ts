import { FIRST_DIVISION } from '@portfolio-league/engine';
import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { ApiError } from '../errors.ts';
import type { LeagueTable } from '../store/types.ts';
import { cachedFor } from './market.ts';

/** Tables saved before divisions existed have none, and everyone started in the first one. */
const withDivisions = (table: LeagueTable): LeagueTable => ({
  ...table,
  rows: table.rows.map((row) => ({ ...row, division: row.division ?? FIRST_DIVISION })),
});

export function leagueRoutes(deps: Deps) {
  const routes = new Hono();

  routes.get('/league', async (c) => {
    c.header('Cache-Control', cachedFor(30));
    const table = await deps.store.getTable();
    return c.json(
      table ? withDivisions(table) : {
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
    return c.json(withDivisions(table));
  });

  return routes;
}
