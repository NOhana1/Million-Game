// Request limits, kept on the server so a changed client can't skip them.
//
// Every request gets a category. Each category allows a number of requests per minute, counted
// twice: per network address, and per signed-in player. The player count uses the verified
// token, so making up tokens doesn't help. The address count catches anyone who isn't signed
// in, or who keeps making new accounts.
//
// Counts live in this server's memory. Vercel can run a few copies at once and each counts on
// its own, so the real ceiling is a few times higher. That's fine for stopping floods, and it
// needs no extra service.

import { createMiddleware } from 'hono/factory';

import type { AuthEnv, TokenVerifier } from './auth.ts';

export type Category = 'read' | 'costly' | 'write' | 'signup' | 'secret';

export type Limits = Record<Category, { perAddress: number; perPlayer: number }>;

/**
 * Requests per minute, set from what the app really sends. An open app sends about 35 reads a
 * minute (45 with the chat open), and opening a security page adds 1 to 3. Search costs
 * nothing, because it filters the list the app already has, in the browser.
 */
export const LIMITS: Limits = {
  // Prices, charts, the table, profiles, your player, the chat. Most are answered by the CDN
  // and cost 0 to 2 database reads. The address allows about 15 busy players, for a family or
  // an office sharing one connection.
  read: { perAddress: 1_500, perPlayer: 120 },
  // Your order list (up to 50 database reads) and portfolio history (every order you have).
  // The app asks for these a few times a minute at most.
  costly: { perAddress: 150, perPlayer: 20 },
  // Orders, watchlist, goal, photo, groups and chat. Each costs database writes.
  write: { perAddress: 300, perPlayer: 30 },
  // Creating a player.
  signup: { perAddress: 10, perPlayer: 5 },
  // Wrong admin codes and alarm secrets, so nobody can guess them by trying many. Only wrong
  // ones count: the real alarm can knock as often as it needs.
  secret: { perAddress: 10, perPlayer: 10 },
};

export const WINDOW_MS = 60_000;
const COSTLY = ['/me/orders', '/me/history']; // each reads many order documents
const PRUNE_ABOVE = 5_000; // entries kept before expired ones are cleared out

/** Which limit a request falls under, or null for the health check. */
export function categoryOf(method: string, path: string): Category | null {
  if (path.endsWith('/health')) return null;
  if (path.endsWith('/tick') || path.includes('/admin/')) return 'secret';
  const reading = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  if (reading && COSTLY.some((end) => path.endsWith(end))) return 'costly';
  if (reading) return 'read';
  if (method === 'POST' && path.endsWith('/players')) return 'signup';
  return 'write';
}

type Count = { used: number; resetsAt: number };

/** A fixed one-minute window per key. Returns 0 if allowed, or the seconds to wait. */
export function counter(now: () => number) {
  const counts = new Map<string, Count>();

  const prune = (at: number) => {
    for (const [key, count] of counts) if (count.resetsAt <= at) counts.delete(key);
  };

  /** A step of -1 gives a place back, for a request that turned out not to count. */
  return (key: string, allowed: number, step = 1): number => {
    const at = now();
    if (counts.size > PRUNE_ABOVE) prune(at);
    let count = counts.get(key);
    if (!count || count.resetsAt <= at) {
      count = { used: 0, resetsAt: at + WINDOW_MS };
      counts.set(key, count);
    }
    if (step > 0 && count.used >= allowed) return Math.max(1, Math.ceil((count.resetsAt - at) / 1000));
    count.used = Math.max(0, count.used + step);
    return 0;
  };
}

/**
 * The caller's address. Vercel sets these headers itself and replaces any the browser sent,
 * so they can't be faked there. Without them (on this computer) everyone shares one count.
 */
export function addressOf(header: (name: string) => string | undefined): string {
  return (
    header('x-real-ip')?.trim() ||
    header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export class RateLimited extends Error {
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super(`Too many requests. Try again in ${retryAfter} seconds.`);
    this.retryAfter = retryAfter;
  }
}

/**
 * Checks both counts before the route runs. A valid token is verified once here and reused by
 * `requireUser`, so signed-in routes don't verify it twice.
 */
export function rateLimit(deps: { now: () => number; verifyToken: TokenVerifier }, limits = LIMITS) {
  const take = counter(deps.now);

  return createMiddleware<AuthEnv>(async (c, next) => {
    const category = categoryOf(c.req.method, c.req.path);
    if (!category) return next();
    const limit = limits[category];
    const addressKey = `a:${category}:${addressOf((name) => c.req.header(name))}`;

    // Every request takes a place first, so a burst of guesses sent at once is still capped.
    const byAddress = take(addressKey, limit.perAddress);
    if (byAddress) throw new RateLimited(byAddress);

    // The admin code and alarm secret use the same header, but they aren't player tokens.
    // A right one gives its place back, so only wrong ones count and the alarm is never slowed.
    if (category === 'secret') {
      await next();
      if (c.res.status !== 401) take(addressKey, limit.perAddress, -1);
      return;
    }
    const token = c.req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    const uid = token ? await deps.verifyToken(token) : null;
    if (uid) {
      c.set('uid', uid);
      const byPlayer = take(`p:${category}:${uid}`, limit.perPlayer);
      if (byPlayer) throw new RateLimited(byPlayer);
    }
    await next();
  });
}
