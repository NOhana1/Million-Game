// Runs the API on this computer: npm run dev --workspace @portfolio-league/api
// With a .env file it uses real Firebase. Without one it uses memory, the token is simply the
// user id, and orders fill by themselves. The Vercel adapter never loads this file.

import { serve } from '@hono/node-server';
import { nextMarketEvent } from '@portfolio-league/engine';

import { createApp, type Deps } from '../app.ts';
import { advancedTo, worldTime } from '../clock.ts';
import { worldFeed } from '../market/world-feed.ts';
import { settle } from '../services/settlement.ts';
import { memoryStore } from '../store/memory.ts';

const port = Number(process.env.PORT ?? 8787);
const useFirebase = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
const SETTLE_EVERY_MS = 5_000;

function memoryApp() {
  const store = memoryStore();
  const deps: Deps = {
    version: 'local',
    environment: 'local',
    store,
    feed: worldFeed('local'),
    verifyToken: async (token) => token,
    now: Date.now,
    tickSecret: 'local',
    clockSecret: 'local',
  };
  const app = createApp(deps);

  // Stands in for the cron.
  setInterval(() => void settle(deps).catch(console.error), SETTLE_EVERY_MS);

  // Local only, for testing fills: jumps to the next market open or close, or to `{ "to": ms }`.
  app.post('/dev/advance', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { to?: unknown };
    const realNow = Date.now();
    const world = worldTime(await store.getClock(realNow), realNow);
    const target = typeof body.to === 'number' ? body.to : nextMarketEvent(world);
    if (target < world) return c.json({ error: { code: 'CLOCK_BACKWARDS', message: 'Forward only.' } }, 400);
    await store.updateClock(realNow, (clock) => advancedTo(clock, target, realNow));
    return c.json({ worldTime: target, settlement: await settle(deps) });
  });

  return app;
}

const app = useFirebase
  ? (await import('../firebase.ts')).firebaseApp('local', process.env)
  : memoryApp();

serve({ fetch: app.fetch, port }, () => {
  console.log(`API on http://localhost:${port}/api/health, using ${useFirebase ? 'Firebase' : 'memory'}`);
});
