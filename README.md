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

### Reading reminders

Readers with notifications on get a nudge if they haven't logged today: at most once every 5 hours per
challenge, 8:00–21:59 in the challenge's timezone, and they can switch it off in Settings. A reader
who missed yesterday and holds a Time Stone gets "Use your Time Stone" instead (once per missed day,
even if they've read today); tapping it opens the check-in on yesterday. The hourly
trigger is a GitHub Actions workflow (`.github/workflows/reading-reminders.yml`) that calls
`POST /api/cron/reminders`. Set it up once in the GitHub repo:

1. **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   `APP_URL` = the app's address (e.g. `https://your-app.vercel.app`).
2. Optional but recommended: a random `CRON_SECRET`, added both as an Actions **secret** and as a
   Vercel environment variable. The endpoint then only accepts calls carrying it.

### Badges

20 badges per challenge (streaks, Efiko for reading every day, time of day, pages, books, the
leaderboard, cheering others on), worked out from the challenge's data by `src/lib/domain/badges.ts`,
the same rules on every phone and on the server. New badges pop up once per device with **Share** and
**Save image**; all of them live on the Me page (Badges tab) and on each member's profile. Cards are
drawn by `/b/[id]/image` (story, square and link-preview sizes, Geist bundled in `src/assets/fonts`,
SIL OFL). The server checks a badge before sharing it; sharing a link makes `/b/[id]` public, saving
the image doesn't.

### Time Stones

A reader earns a Time Stone for every 7 days they read in a challenge and can hold 2. One stone logs
reading for a missed day, on the day right after it only (miss Monday, use it on Tuesday), and that
day then counts for the streak, goal, XP and badges (not the time-of-day ones). Logging yesterday is
free until 3am in the challenge's timezone, and adding to a day that already has a check-in is always
free. A spent stone stays spent even if that check-in is deleted. The rules live in
`src/lib/domain/time-stones.ts`; the server re-checks every stone (`session.create` in
`src/server/push.ts`), and stone check-ins carry a label in the crew feed.

## Docs

- [Architecture](docs/STILL_READING_ARCHITECTURE.md)
- [Data model](docs/STILL_READING_DATA_MODEL.md)
- [Sync](docs/STILL_READING_SYNC.md)
- [Test plan](docs/STILL_READING_TEST_PLAN.md)
