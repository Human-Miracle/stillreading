# Still Reading — Architecture

Still Reading is a mobile-first, installable PWA for 30-day social reading challenges.
There are **no accounts**. Each browser/PWA install is an anonymous device identity.

## Stack (as built)

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript | Turbopack build |
| Styling | Tailwind CSS v4, tokens in `src/app/globals.css` (`@theme`) | No component kit; small in-house primitives |
| Local DB | IndexedDB via Dexie 4 (`src/local`) | Primary store for everything the UI renders |
| Cloud DB | Neon Postgres via Drizzle ORM (`src/db`) | `node-postgres` pool (+ `attachDatabasePool` on Vercel Fluid) → real transactions, portable to any Postgres |
| Dev/Test DB | PGlite (embedded Postgres, WASM) | Used automatically when `DATABASE_URL` is unset |
| Validation | Zod (`src/lib/validation`) | Every server-bound payload |
| PWA | Serwist (`@serwist/turbopack`) | Service worker served from `/serwist/sw.js` |
| Object storage | none in MVP | Share card is rendered client-side on `<canvas>`; avatars are initials |
| Hosting | Vercel | |

### Why no Vercel Blob (yet)
Nothing in the MVP needs persistent files: share images are generated on-device and handed to the
Web Share API / downloaded, avatars are initials and book covers are optional URLs. The Blob token is
therefore not required. Add Blob (or Cloudflare R2 / Supabase Storage) only when avatar upload ships.

## Layers

```
src/
  app/                 Next.js routes (UI pages + route handlers under app/api)
  components/          UI components (challenge/, check-in/, feed/, people/, pwa/, sync/, ui/)
  lib/domain/          Pure domain logic: dates, goals, pace, streaks, group stats (unit-tested)
  lib/validation/      Zod schemas shared by client + server
  lib/ids.ts           Prefixed, sortable, random ids (pt_, bk_, rs_, op_ ...)
  local/               Dexie schema, repositories (local writes + enqueue), sync engine, device identity
  db/                  Drizzle schema + database client (Neon or PGlite)
  server/              Server-only services: auth, rate limit, challenges, join, sync (push/pull)
```

Rules:
* `lib/domain` has **no** IO and no React — it is the single source of truth for goal/streak/pace math,
  used both by the UI (local data) and could be used by the server.
* UI never calls `fetch` for its own reading state. It writes Dexie through `local/repositories`, which
  also enqueues a sync operation. The sync engine (`local/sync`) talks to the API.
* Server routes are thin: parse → authenticate device → rate limit → service → JSON.

## Identity & authorization (no auth provider)

* On first run the client creates `device_id` (`dvc_…`) and a 256-bit `device_secret` and stores them in
  IndexedDB (`kv` table). They are sent as `x-stillreading-device` / `x-stillreading-secret` headers, never in URLs.
* Server stores only `sha256(secret)` in `devices` (trust-on-first-use registration). Ids are random, so
  first use cannot be squatted.
* **Membership credential is derived, not issued**: a request may mutate participant `P` only if the
  authenticated device owns `P` (`challenge_participants.device_id`) and `P.status = 'active'`. Client
  supplied participant ids are never trusted on their own. Host-only operations additionally require
  `P.role = 'host'`.
* Join codes (12 chars base62, ~71 bits) authorize *joining only*. Challenge ids are random too and
  reading a challenge requires active membership.
* Device ids are never returned to other participants.

## Local-first flow

```
user action → Dexie write (syncStatus=pending) → UI updates (useLiveQuery)
            → syncQueue.add(op with op_id) → sync engine (single-flight, Web Locks)
            → POST /api/sync (batched, idempotent) → Neon
            → GET /api/challenges/:id/sync?since=cursor → merge into Dexie
```

Create challenge and join are **online-only** (they need the server to mint/validate the join code);
everything after joining works offline. See `STILL_READING_SYNC.md`.

## Time

Each challenge stores the host's IANA timezone at creation. "Today", challenge day numbers and the
`date` of reading sessions are all computed in the challenge timezone (`lib/domain/dates.ts`), so a
participant in another timezone cannot gain an extra day.

## PWA

* Manifest: `src/app/manifest.ts`; icons in `public/icons`.
* Service worker: `src/app/sw.ts`, built by Serwist route handler `src/app/serwist/[path]/route.ts`.
  Precaches the build, NetworkFirst for pages (so visited challenge pages open offline), offline
  fallback document `/offline`.
* Install prompt is contextual: shown after the first successful join/create, dismissible.
* `start_url` is `/?source=pwa`; the landing page forwards an installed app straight into the active
  challenge.

## Rate limiting

Fixed-window counters in Postgres (`rate_limits` table, one `INSERT … ON CONFLICT DO UPDATE` per
request), keyed by device or IP. Works across serverless instances without another vendor. If traffic
grows, swap `src/server/rate-limit.ts` for Upstash Redis (Vercel Marketplace).

## Observability

`src/server/log.ts` writes structured JSON lines (sync failures, API errors, rejected memberships,
duplicate operations). It never logs secrets, reflections or display names.
Product events go to `POST /api/events` → `product_events` (no PII: event name, challenge id, props).

## Decisions log

* **Neon over alternatives**: serverless Postgres with scale-to-zero and per-preview branches via the
  Vercel integration; Drizzle works unchanged on PGlite for local/test.
* **Single primary goal** in the UI; schema has `priority` so a secondary goal can be added without
  migration.
* **Total-type goals** (total pages, books) count a "goal day" as any day with reading.
* **Pace** uses end-of-day semantics from the spec: expected = target × day/duration,
  remaining days = duration − day.
* **Consistency** counts today only once today's goal is met (today is "in progress", never "missed").
* **Private reflections never leave the device** — they are stored in Dexie and stripped from the
  sync payload.
* Feed loads from local cache; the first sync of a challenge pulls the whole (bounded: ≤ duration ×
  participants) dataset, then only deltas. The feed UI paginates rendering.
* **Late joiners** are measured from the day they joined (in the challenge timezone): their goal
  total, pace, consistency and day count cover only the days they could have read. Hosts always count
  from the challenge start. (`participantStart` / `participantDuration` in `lib/domain/dates.ts`.)
* **Logging for yesterday** is allowed (forgot to check in), but never for days before joining. The
  server accepts any date inside the challenge up to today, so offline check-ins that sync late are kept.
