import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { worldTime } from '../clock.ts';
import { ApiError } from '../errors.ts';
import { findListing, marketSnapshot, priceHistory, worldStatus } from '../market/quotes.ts';

// The CDN answers repeat requests, so a rush of players doesn't reach the database.
const cachedFor = (seconds: number) =>
  `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds}`;

export function marketRoutes(deps: Deps) {
  const routes = new Hono();
  const now = async () => worldTime(await deps.store.getClock(deps.now()), deps.now());

  routes.get('/world', async (c) => {
    c.header('Cache-Control', cachedFor(5));
    return c.json(worldStatus(await now()));
  });

  routes.get('/market', async (c) => {
    c.header('Cache-Control', cachedFor(5));
    return c.json(marketSnapshot(deps.feed, await now()));
  });

  routes.get('/market/:id/history', async (c) => {
    const listing = findListing(deps.feed, c.req.param('id'));
    if (!listing) throw new ApiError(404, 'UNKNOWN_SECURITY', 'No such security.');
    c.header('Cache-Control', cachedFor(60));
    return c.json(priceHistory(deps.feed, listing, await now()));
  });

  return routes;
}
