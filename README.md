# Still Reading

A mobile-first, installable PWA for 30-day social reading challenges.
**Set a goal → join a challenge → read → check in → see friends → read again tomorrow.**

No accounts. Local-first (IndexedDB) with background sync to Postgres. Works offline.

## Quick start (no database setup needed)

```bash
npm install
npm run db:seed     # optional: "October Reading Challenge" demo with 6 readers on day 12
npm run dev         # http://localhost:3000
```

Without `DATABASE_URL`, the server uses an embedded Postgres (PGlite) stored in `.data/pglite`.
After seeding, open `http://localhost:3000/join/DemoOctober30` to join the demo as a 7th reader.
(Stop `npm run dev` before running `db:seed` — PGlite allows one process at a time.)

## Scripts

| | |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` · `lint` · `test` | TypeScript, ESLint, Vitest (unit + integration against PGlite) |
| `npm run test:e2e` | Playwright flows A–D (builds and starts a production server) |
| `npm run verify` | typecheck + lint + tests + build |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (or local PGlite) |
| `npm run db:seed` | Demo data |
| `npm run icons` | Re-render PWA icons |

## Versioning

Settings shows the app version from `package.json` (e.g. V1.0.2). Bump it with every release:
`npm version patch --no-git-tag-version` (1.0.2 → 1.0.3).

## Deploying to Vercel

1. Import the repo in Vercel.
2. **Storage → Marketplace → Neon** → connect to the project. This sets `DATABASE_URL`
   (and gives every preview deployment its own database branch).
3. Deploy. The `vercel-build` script runs migrations and then `next build`.

Environment variables: `DATABASE_URL`, plus `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and optionally
`VAPID_SUBJECT` for reply notifications (generate a pair with `npx web-push generate-vapid-keys`;
without them the feature hides itself). No auth provider and no Blob token are needed.

## Docs

- [Architecture](docs/STILL_READING_ARCHITECTURE.md)
- [Data model](docs/STILL_READING_DATA_MODEL.md)
- [Sync](docs/STILL_READING_SYNC.md)
- [Test plan](docs/STILL_READING_TEST_PLAN.md)
