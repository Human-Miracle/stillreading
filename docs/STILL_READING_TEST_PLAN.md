# Still Reading — Test Plan

Run everything with `npm run verify` (typecheck, lint, unit+integration, build) and `npm run test:e2e`.

## Unit (`tests/unit`, Vitest)
* dates: today in timezone, challenge day number, phase (upcoming/active/ended), date ranges, DST-safe
  day diff.
* goals: preset → goal, daily/total targets, unit matching, goal day detection (20 ✓, 19 ✗),
  progress %, display clamp, no negatives.
* pace: spec example (600 pages, day 15, 210 read → 90 behind, 26/day), last day, ahead, complete.
* streaks: spec example (✓✓✓✗✓ → current 1, longest 3, 4 reading days), today-in-progress does not
  break a streak, consistency.
* group stats: categories, no universal score, participation.
* leaderboard XP: effort XP by estimated reading time (page ≈ 1.5 min, chapter ≈ 20 min), habit XP, top-3 placement bonus (ties share), no day-one ties across units.
* validation: Zod limits (name 1–40, challenge 1–80, description ≤500, amount positive int,
  reflection ≤500).

## Integration (`tests/integration`, Vitest + PGlite + real route handlers)
* create challenge → host participant, join code, idempotent on retried op id.
* join: preview, join, duplicate join returns same membership, removed device cannot rejoin,
  invalid code 404.
* authorization: wrong secret 401; mutating someone else's book/session rejected; non-host cannot
  remove/rename.
* sync push: session create, duplicate op id → no duplicate row; stale LWW; reaction toggle unique.
* sync pull: since-cursor deltas, tombstones, device ids never exposed, removed member gets 403.
* client sync engine against real handlers (fake-indexeddb): offline check-in stays local, survives
  "restart" (new engine instance on same DB), syncs on reconnect without duplicates, multiple queued
  check-ins, transient failure → retry with backoff, validation failure → `failed`, network cut
  mid-sync (server applied, response lost) → retry is a duplicate, not a second row.

* Reading Pass: existing members adopted, pass stored only as scrypt, claim on a new phone, duplicate
  membership merge, wrong pass, rotation, owner-only sealed private reflections, host re-invite once.
* Client: note crypto round-trip, pass normalization, backfill of pre-pass private notes, decrypt on
  a second device, rotation keeps the note key.

## E2E (`e2e`, Playwright, Chromium)
* Flow A: create challenge → copy link → second browser context joins → goal → check-in.
* Flow B: joined user goes offline → logs reading → reload (offline, served by SW) → reading still
  there → back online → synced; other member sees it once.
* Flow C: multiple participants check in → feed → reactions → stats.
* Flow D: ended challenge → completion screen + share card.
* Flow E/F: install modal on every visit, skippable; iPhone Safari steps.
* Flow G: Reading Pass moves a reader and their private reflections to a new phone; wrong pass refused.

## Manual (before release)
iPhone Safari, iPhone installed PWA, Android Chrome install, desktop Chrome, airplane mode,
reconnect, two phones in one challenge.
