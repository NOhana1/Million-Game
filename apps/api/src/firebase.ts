// Connects the app to real Firebase. Used on Vercel, and locally when settings are present.

import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { createApp } from './app.ts';
import type { TokenVerifier } from './auth.ts';
import { readConfig } from './config.ts';
import { worldFeed } from './market/world-feed.ts';
import { firestoreStore } from './store/firestore.ts';

export function firebaseApp(version: string, env: NodeJS.ProcessEnv) {
  const config = readConfig(env);
  const { project_id, client_email, private_key } = config.FIREBASE_SERVICE_ACCOUNT;
  const firebase = initializeApp({
    credential: cert({ projectId: project_id, clientEmail: client_email, privateKey: private_key }),
  });

  const auth = getAuth(firebase);
  const verifyToken: TokenVerifier = async (token) => {
    try {
      return (await auth.verifyIdToken(token)).uid;
    } catch (error) {
      // A bad token is the client's problem. Anything else is an outage, and must look like one.
      if (String((error as { code?: unknown }).code).startsWith('auth/')) return null;
      throw error;
    }
  };

  return createApp({
    version,
    environment: env.VERCEL_ENV ?? 'local',
    store: firestoreStore(getFirestore(firebase)),
    feed: worldFeed(config.WORLD_SEED),
    verifyToken,
    // Read fresh from Firebase, so a player who just clicked the link can join straight away.
    emailConfirmed: async (uid) => (await auth.getUser(uid)).emailVerified,
    now: Date.now,
    tickSecret: config.TICK_SECRET,
    clockSecret: config.CLOCK_SECRET,
  });
}
