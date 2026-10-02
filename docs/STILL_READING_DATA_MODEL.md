# Still Reading — Data Model

Source of truth: `src/db/schema.ts` (server, Drizzle) and `src/local/db.ts` (device, Dexie).
Ids are client-generated where the client creates the record (`pt_`, `gl_`, `bk_`, `rs_`, `rx_`, `op_`);
challenge ids (`ch_`) and join codes are minted by the server.

Every shared table carries:

* `created_at`, `updated_at` — `updated_at` is the record version used for last-write-wins.
* `server_updated_at` — set by the server on every write; the pull cursor.
* `deleted_at` (where records can be removed) — soft delete so deletions propagate through sync.

## Server (Postgres)

### devices
| column | type | notes |
| --- | --- | --- |
| id | text pk | `dvc_…` |
| secret_hash | text | sha256 of device secret |
| created_at, last_seen_at | timestamptz | |

### challenges
| column | notes |
| --- | --- |
| id | `ch_…`, random |
| public_join_code | unique, 12 chars base62 |
| name (≤80), description (≤500) | |
| start_date, end_date | `date`, inclusive range; `CHECK end_date >= start_date` |
| duration_days | `CHECK 1..365` |
| timezone | IANA, captured from host |
| status | `draft \| active \| completed \| archived` — stored `active`/`archived`; *completed* is derived from dates |
| host_participant_id | |

### challenge_participants
`id, challenge_id → challenges, device_id → devices, display_name (1–40), avatar_url, role (host|participant), status (active|removed|left), joined_at, updated_at, server_updated_at`
* `UNIQUE (challenge_id, device_id)` — one membership per device per challenge (rejoining after
  *leaving* reactivates the same row; *removed* devices cannot rejoin).

### goals
`id, challenge_id, participant_id, priority (primary|secondary), goal_type (daily|total), target_unit (pages|chapters|minutes|books|days), target_value > 0, frequency (daily|challenge), total_target > 0, …timestamps`
* `UNIQUE (participant_id, priority)`

Goal presets (`lib/domain/goals.ts → goalFromPreset`):

| Preset | goal_type | unit | target_value | frequency | total_target |
| --- | --- | --- | --- | --- | --- |
| Read every day | daily | days | 1 | daily | duration |
| N pages/day | daily | pages | N | daily | N × duration |
| N chapters/day | daily | chapters | N | daily | N × duration |
| N minutes/day | daily | minutes | N | daily | N × duration |
| N books | total | books | N | challenge | N |
| N total pages | total | pages | N | challenge | N |

### books
`id, participant_id, challenge_id, title (≤200), author, cover_url, total_pages, current_page, status (planned|reading|completed|abandoned), started_at, completed_at, …timestamps, deleted_at`

`cover_url` is optional and must be an `https://covers.openlibrary.org/…` URL (enforced by the
op validator), because every reader in the challenge loads it. Lookups go through
`GET /api/books/search`, which queries the Open Library search API server-side (rate-limited per IP,
CDN-cacheable). The book form suggests matches while typing and has a "Find a cover" picker; books
saved without a cover get one looked up automatically on the owner's device (once per book, retried
if the lookup fails, title-only when title + author finds nothing). A `book.upsert` that omits
`coverUrl` keeps the stored cover; `null` clears it.

A challenge does not belong to a book: participants can read several books in sequence.

### reading_sessions
`id, participant_id, challenge_id, book_id (nullable, ON DELETE SET NULL), date (challenge-local), amount (CHECK > 0), unit (pages|chapters|minutes), pages (nullable, CHECK > 0, only when unit ≠ pages), reflection (≤500, shared only), …timestamps, deleted_at`

Minutes and chapters check-ins also ask how many pages they covered (`pages`). `pagesRead()` counts a
session's pages (`amount` for pages check-ins, `pages` otherwise), and pages totals, pages goals,
book progress and the leaderboard all use it. Rows from before the column have `pages = null` and
count 0 pages.

Append-oriented: sessions are created and (soft) deleted, not edited.

### reactions
`id, participant_id, reading_session_id → reading_sessions, challenge_id, type (heart|fire|clap|laugh|book), …timestamps, deleted_at`
* `UNIQUE (participant_id, reading_session_id, type)` — toggling re-uses the row via `deleted_at`.

### push_subscriptions
`endpoint (PK, push-service URL), device_id → devices (ON DELETE CASCADE), p256dh, auth, created_at, updated_at`
* One per browser/app install. `challenge_participants.notify_replies` (default false) and
  `replies.notified_at` drive reply notifications (see Sync → Reply notifications).

### replies
`id (rp_…), participant_id, reading_session_id → reading_sessions (ON DELETE CASCADE), challenge_id, parent_id (nullable, top-level reply), body (1–500, cleaned), notified_at, …timestamps, deleted_at`
* Threads are one level deep, like Instagram: a reply to a nested reply is stored under the same
  top-level reply (the server normalises `parent_id`); the client prefills `@name`. If a parent is
  deleted its answers show as top-level replies.

### reply_likes
`id (rl_<reply>.<participant>, derived), participant_id, reply_id → replies (ON DELETE CASCADE), challenge_id, …timestamps, deleted_at`
* `UNIQUE (participant_id, reply_id)`; ♥ toggles reuse the row via `deleted_at` (`reply.like` op, last write wins).
* A thread under a check-in, oldest first (`/c/:id/feed/:sessionId`). Any member can reply; only the author can delete (soft delete, tombstone synced).

### processed_operations
`op_id pk, device_id, op_type, result jsonb, created_at` — idempotency ledger (see `STILL_READING_SYNC.md`).

### rate_limits
`key, window_start, count` — fixed-window counters.

### product_events
`id, name, challenge_id, props jsonb, created_at` — anonymous product analytics.

### Indexes
`challenges.public_join_code (unique)`, `challenge_participants(challenge_id)`, `(device_id)`,
`goals(participant_id)`, `reading_sessions(challenge_id, date)`, `(participant_id)`, `(book_id)`,
`(challenge_id, server_updated_at)` on every synced table, `reactions(reading_session_id)`.

### readers
`id (rd_…), pass_lookup (scrypt hex, unique), pass_set_at, wrapped_key ("v1.salt.iv.ct"), created_at, updated_at`
* `devices.reader_id` and `challenge_participants.reader_id` point here; `UNIQUE (challenge_id, reader_id)`.

### reinvites
`token_hash pk, participant_id, created_by, expires_at, used_at` — one-time host re-invite links.

`reading_sessions.private_reflection` holds the sealed private reflection ("v1.iv.ct").

## Device (IndexedDB / Dexie)

| table | key | purpose |
| --- | --- | --- |
| kv | key | device identity, `reader` (reader id, Reading Pass, note key), small prefs |
| challenges | id | challenge + `myParticipantId`, `cursor`, `access` |
| participants | id | public profiles |
| goals | id | |
| books | id | |
| sessions | id | includes local-only `reflectionShared=false` reflections |
| reactions | id | |
| syncQueue | opId | pending/failed operations |

Every record has `createdAt`, `updatedAt`; own records have `syncStatus: pending | synced | failed`.

The IndexedDB database is named `read30` (from before the product was renamed); it is kept so existing devices keep their identity and data.
