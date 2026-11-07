import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { worldTime } from '../clock.ts';
import { ApiError } from '../errors.ts';
import {
  findListing,
  isRange,
  marketSnapshot,
  marketSparks,
  priceHistory,
  rangeHistory,
  worldStatus,
} from '../market/quotes.ts';

// The CDN answers repeat requests, so a rush of players doesn't reach the database.
export const cachedFor = (seconds: number) =>
  `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds}`;

export function marketRoutes(deps: Deps) {
  const routes = new Hono();
  const now = async () => worldTime(await deps.store.getClock(deps.now()), deps.now());

  routes.get('/world', async (c) => {
    const realNow = deps.now();
    const clock = await deps.store.getClock(realNow);
    c.header('Cache-Control', cachedFor(5));
    return c.json({
      ...worldStatus(worldTime(clock, realNow)),
      clock: { speed: clock.speed, paused: clock.paused, tradingPaused: clock.tradingPaused ?? false },
    });
  });

  routes.get('/market', async (c) => {
    c.header('Cache-Control', cachedFor(5));
    return c.json(marketSnapshot(deps.feed, await now()));
  });

  routes.get('/market/sparks', async (c) => {
    c.header('Cache-Control', cachedFor(120));
    return c.json(marketSparks(deps.feed, await now()));
  });

  routes.get('/market/:id/history', async (c) => {
    const listing = findListing(deps.feed, c.req.param('id'));
    if (!listing) throw new ApiError(404, 'UNKNOWN_SECURITY', 'No such security.');
    const range = c.req.query('range');
    if (range !== undefined && !isRange(range)) {
      throw new ApiError(400, 'UNKNOWN_RANGE', 'No such range.');
    }
    c.header('Cache-Control', cachedFor(60));
    const world = await now();
    return c.json(
      range ? rangeHistory(deps.feed, listing, world, range) : priceHistory(deps.feed, listing, world),
    );
  });

  return routes;
}
