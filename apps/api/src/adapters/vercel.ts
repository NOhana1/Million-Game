// The only Vercel-specific file. Moving to Cloud Functions means replacing this one.
// Vercel's Node runtime calls a plain (request, response) handler.

import { getRequestListener } from '@hono/node-server';

import { firebaseApp } from '../firebase.ts';

const app = firebaseApp(process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown', process.env);

export default getRequestListener(app.fetch);
