// All routes live behind one router, so moving off Vercel only means changing src/adapters.

import { Hono } from 'hono';

import type { TokenVerifier } from './auth.ts';
import { ApiError } from './errors.ts';
import type { PriceFeed } from './market/feed.ts';
import { clockRoutes } from './routes/clock.ts';
import { groupRoutes } from './routes/groups.ts';
import { leagueRoutes } from './routes/league.ts';
import { marketRoutes } from './routes/market.ts';
import { newsRoutes } from './routes/news.ts';
import { orderRoutes } from './routes/orders.ts';
import { playerRoutes } from './routes/players.ts';
import { profileRoutes } from './routes/profiles.ts';
import { tickRoutes } from './routes/tick.ts';
import type { Store } from './store/types.ts';

export type Deps = {
  version: string;
  environment: string;
  store: Store;
  feed: PriceFeed;
  verifyToken: TokenVerifier;
  now: () => number; // real time
  tickSecret: string;
  clockSecret: string;
  fetchFeed?: typeof fetch; // tests pass their own
};

export function createApp(deps: Deps) {
  const app = new Hono().basePath('/api');

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    console.error(error);
    return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'No such route.' } }, 404));

  // Touches no database, so uptime checks cost no quota.
  app.get('/health', (c) => c.json({ ok: true, version: deps.version, environment: deps.environment }));

  app.route('/', marketRoutes(deps));
  app.route('/', newsRoutes(deps));
  app.route('/', playerRoutes(deps));
  app.route('/', profileRoutes(deps));
  app.route('/', groupRoutes(deps));
  app.route('/', orderRoutes(deps));
  app.route('/', leagueRoutes(deps));
  app.route('/', tickRoutes(deps));
  app.route('/', clockRoutes(deps));

  return app;
}
