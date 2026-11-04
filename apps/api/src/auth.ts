import { createMiddleware } from 'hono/factory';

import { ApiError } from './errors.ts';

/** Returns the signed-in user's id, or null if the token isn't valid. */
export type TokenVerifier = (token: string) => Promise<string | null>;

export type AuthEnv = { Variables: { uid: string } };

export const requireUser = (verify: TokenVerifier) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const token = c.req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    const uid = token ? await verify(token) : null;
    if (!uid) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in first.');
    c.set('uid', uid);
    await next();
  });
