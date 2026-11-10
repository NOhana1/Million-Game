// All routes live behind one router, so moving off Vercel only means changing src/adapters.

import { Hono } from 'hono';

import type { AuthEnv, TokenVerifier } from './auth.ts';
import { ApiError } from './errors.ts';
import type { PriceFeed } from './market/feed.ts';
import { type Limits, LIMITS, RateLimited, rateLimit } from './rate-limit.ts';
import { clockRoutes } from './routes/clock.ts';
import { botAdminRoutes } from './routes/bots-admin.ts';
import { rosterRoutes } from './routes/roster.ts';
import { statusRoutes } from './routes/status.ts';
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
  /** Whether the account's email is confirmed. Without it, as locally and in tests, every email counts as confirmed. */
  emailConfirmed?: (uid: string) => Promise<boolean>;
  /** Deletes the sign-in account, which frees its email for a new sign-up. Missing locally and in tests. */
  deleteAccount?: (uid: string) => Promise<void>;
  /** The sign-in account for an email, if there is one. Missing locally and in tests. */
  findAccount?: (email: string) => Promise<{ uid: string; confirmed: boolean; createdAt: number } | null>;
  now: () => number; // real time
  tickSecret: string;
  clockSecret: string;
  fetchFeed?: typeof fetch; // tests pass their own
  limits?: Limits; // tests pass smaller ones
};

export function createApp(deps: Deps) {
  const app = new Hono<AuthEnv>().basePath('/api');

  app.onError((error, c) => {
    if (error instanceof RateLimited) {
      c.header('Retry-After', String(error.retryAfter));
      return c.json(
        { error: { code: 'RATE_LIMITED', message: error.message, retryAfter: error.retryAfter } },
        429,
      );
    }
    if (error instanceof ApiError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    console.error(error);
    return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'No such route.' } }, 404));

  // Runs before every route, so no request skips it.
  app.use('*', rateLimit(deps, deps.limits ?? LIMITS));

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
  app.route('/', rosterRoutes(deps));
  app.route('/', botAdminRoutes(deps));
  app.route('/', statusRoutes(deps));

  return app;
}
