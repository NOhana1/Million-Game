# Connecting the API to Firebase

The code is ready. Only these settings are missing.

## 1. Create the two settings

Do this once for staging and once for production. Never paste them into a chat or commit them.

| Setting | Where it comes from |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase console, Project settings, Service accounts, **Generate new private key**. Use the whole file, on one line |
| `WORLD_SEED` | Run `openssl rand -hex 32`. Use a different one per project |

## 2. Put them in Vercel

Add both to the project's environment variables, with staging values for Preview and production values for Production.

## 3. Deploy the rules

```bash
npx firebase-tools deploy --only firestore:rules --project <project id>
```

## 4. Check it works

| Check | Expected |
|---|---|
| `GET /api/health` | `{ "ok": true }` |
| `GET /api/market` | 20 securities. A `world/clock` document now exists |
| Sign up in the app, then `GET /api/me` | ₪1,000,000 |
| Place an order twice with the same id | One order, charged once |

## Running against real Firebase locally

Copy `.env.example` to `.env` in `apps/api`, fill it in with **staging** values, then run:

```bash
npm run dev --workspace @portfolio-league/api
```

## Running the database tests

These need Java and the emulator:

```bash
npx firebase-tools emulators:exec --only firestore "npm test --workspace @portfolio-league/api"
```
