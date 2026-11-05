import { createHash, timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { ApiError } from '../errors.ts';
import { settle } from '../services/settlement.ts';

const digest = (text: string) => createHash('sha256').update(text).digest();

/** Comparing hashes keeps the lengths equal, and the compare takes the same time either way. */
export const secretMatches = (given: string, secret: string) =>
  timingSafeEqual(digest(given), digest(secret));

export function tickRoutes(deps: Deps) {
  const routes = new Hono();

  routes.post('/tick', async (c) => {
    const given = c.req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!given || !secretMatches(given, deps.tickSecret)) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Not allowed.');
    }
    return c.json(await settle(deps));
  });

  return routes;
}
