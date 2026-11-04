// Runs the API on this computer: npm run dev --workspace @portfolio-league/api
// With a .env file it uses real Firebase. Without one it uses memory, and the token is
// simply the user id. The Vercel adapter never loads this file.

import { serve } from '@hono/node-server';

import { createApp } from '../app.ts';
import { temporaryFeed } from '../market/temporary-feed.ts';
import { memoryStore } from '../store/memory.ts';

const port = Number(process.env.PORT ?? 8787);
const useFirebase = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);

const app = useFirebase
  ? (await import('../firebase.ts')).firebaseApp('local', process.env)
  : createApp({
      version: 'local',
      store: memoryStore(),
      feed: temporaryFeed('local'),
      verifyToken: async (token) => token,
      now: Date.now,
    });

serve({ fetch: app.fetch, port }, () => {
  console.log(`API on http://localhost:${port}/api/health, using ${useFirebase ? 'Firebase' : 'memory'}`);
});
