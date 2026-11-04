import type { Context } from 'hono';
import type { z } from 'zod';

import { ApiError } from './errors.ts';

/** Reads a JSON body and checks its shape. Anything else is the client's mistake. */
export async function readBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid body.');
  return parsed.data;
}
