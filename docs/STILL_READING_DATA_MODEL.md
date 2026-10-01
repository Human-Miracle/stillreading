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

A challenge does not belong to a book: participants can read several books in sequence.

### reading_sessions
`id, participant_id, challenge_id, book_id (nullable, ON DELETE SET NULL), date (challenge-local), amount (CHECK > 0), unit (pages|chapters|minutes), reflection (≤500, shared only), …timestamps, deleted_at`

Append-oriented: sessions are created and (soft) deleted, not edited.

### reactions
`id, participant_id, reading_session_id → reading_sessions, challenge_id, type (heart|fire|clap|book), …timestamps, deleted_at`
* `UNIQUE (participant_id, reading_session_id, type)` — toggling re-uses the row via `deleted_at`.

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

## Device (IndexedDB / Dexie)

| table | key | purpose |
| --- | --- | --- |
| kv | key | device identity, small prefs (install prompt dismissed, …) |
| challenges | id | challenge + `myParticipantId`, `cursor`, `access` |
| participants | id | public profiles |
| goals | id | |
| books | id | |
| sessions | id | includes local-only `reflectionShared=false` reflections |
| reactions | id | |
| syncQueue | opId | pending/failed operations |

Every record has `createdAt`, `updatedAt`; own records have `syncStatus: pending | synced | failed`.

The IndexedDB database is named `read30` (from before the product was renamed); it is kept so existing devices keep their identity and data.
