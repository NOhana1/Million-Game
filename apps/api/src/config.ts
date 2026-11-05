// Settings from the environment. A missing or wrong value stops the server at start,
// not halfway through a player's order. Real values live in Vercel, never in git.

import { z } from 'zod';

const ServiceAccount = z.object({
  project_id: z.string().min(1),
  client_email: z.email(),
  private_key: z.string().includes('PRIVATE KEY'),
});

const Environment = z.object({
  FIREBASE_SERVICE_ACCOUNT: z
    .string()
    .transform((text, context) => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        context.addIssue({ code: 'custom', message: 'must be the key file\'s JSON' });
        return z.NEVER;
      }
    })
    .pipe(ServiceAccount),
  WORLD_SEED: z.string().min(32),
  TICK_SECRET: z.string().min(32),
  CLOCK_SECRET: z.string().min(32),
});

export function readConfig(env: NodeJS.ProcessEnv) {
  const parsed = Environment.safeParse(env);
  if (parsed.success) return parsed.data;
  // Names only: an error message must never print a secret.
  const problems = parsed.error.issues.map((issue) => issue.path.join('.'));
  throw new Error(`Missing or invalid settings: ${[...new Set(problems)].join(', ')}`);
}
