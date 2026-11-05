import { createHash, timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { ApiError } from '../errors.ts';
import { settle } from '../services/settlement.ts';

const digest = (text: string) => createHash('sha256').update(text).digest();

/** Comparing hashes keeps the lengths equal, and the compare takes the same time either way. */
export const secretMatches = (given: string, secret: string) =>
  timingSafeEqual(digest(given), digest(secret));

/** Throws unless the request carries this exact secret. */
export function requireSecret(authorization: string | undefined, secret: string) {
  const given = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!given || !secretMatches(given, secret)) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Not allowed.');
  }
}

export function tickRoutes(deps: Deps) {
  const routes = new Hono();

  routes.post('/tick', async (c) => {
    requireSecret(c.req.header('Authorization'), deps.tickSecret);
    return c.json(await settle(deps));
  });

  return routes;
}
