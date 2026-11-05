// Builds the whole site into Vercel's Build Output format (.vercel/output):
// the Expo web export as static files, and the API as one bundled function.
// Bundling here means Vercel never has to understand the engine's raw .ts files.

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

// Public web settings, sent to every visitor's browser anyway, so they are not secrets.
// The real game gets prod. Everything else, including previews, gets dev.
const FIREBASE_WEB = {
  production: {
    EXPO_PUBLIC_FIREBASE_API_KEY: 'AIzaSyAWmzODB9MWGokSk1XgOSjv0oBMNQsHBlU',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'portfolio-league-prod.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'portfolio-league-prod',
    EXPO_PUBLIC_FIREBASE_APP_ID: '1:731697200006:web:9b20adde5dfd736a050a07',
  },
  dev: {
    EXPO_PUBLIC_FIREBASE_API_KEY: 'AIzaSyDFiMHgZfaOnzOURLEsFONcvNZjc6NuZ6A',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'portfolio-league-dev.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'portfolio-league-dev',
    EXPO_PUBLIC_FIREBASE_APP_ID: '1:469407098904:web:310420937e25864af07b6d',
  },
};
const firebaseWeb = process.env.VERCEL_ENV === 'production' ? FIREBASE_WEB.production : FIREBASE_WEB.dev;

const output = '.vercel/output';
const fn = `${output}/functions/api.func`;

rmSync(output, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

execSync('npx expo export --platform web --output-dir dist', {
  cwd: 'apps/app',
  stdio: 'inherit',
  env: { ...process.env, ...firebaseWeb },
});
cpSync('apps/app/dist', `${output}/static`, { recursive: true });

await build({
  entryPoints: ['apps/api/src/adapters/vercel.ts'],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Some dependencies are CommonJS and need these names inside an ES module.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __pathDirname } from 'node:path';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __pathDirname(__filename);',
    ].join('\n'),
  },
});

writeFileSync(`${fn}/package.json`, JSON.stringify({ type: 'module' }));
writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify({
    runtime: 'nodejs22.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    regions: ['fra1'],
  }),
);

writeFileSync(
  `${output}/config.json`,
  JSON.stringify({
    version: 3,
    routes: [
      { src: '^/api(/.*)?$', dest: '/api' },
      { handle: 'filesystem' },
      { src: '/.*', dest: '/index.html' },
    ],
  }),
);
