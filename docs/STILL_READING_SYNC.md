# Still Reading — Sync

## Principles
1. The UI never waits for the network for reading-state changes.
2. Every change is written to IndexedDB first, then an operation is appended to `syncQueue`.
3. Every operation has an `op_id`; the server processes each `op_id` at most once.
4. Nothing is silently dropped: an operation leaves the queue only on success, a recognised duplicate,
   or a stale (LWW) answer that the client then adopts. Rejected operations stay as `failed` and are
   surfaced in the UI.

## Operations (`src/lib/validation/ops.ts`)

| type | who | payload |
| --- | --- | --- |
| `participant.update` | self | displayName |
| `participant.leave` | self | — |
| `goal.upsert` | self | goal fields |
| `book.upsert` / `book.delete` | self | book fields / id |
| `session.create` / `session.delete` | self | session fields (shared reflection in plain text, private one sealed) / id |
| `session.private` | self | id, sealed private reflection (backfill for notes written before the pass) |
| `reaction.set` | self | sessionId, type, active |
| `challenge.update` | host | name, description |
| `challenge.archive` | host | — |
| `participant.remove` | host | participantId |

Envelope: `{ opId, challengeId, type, payload }`.

## Push — `POST /api/sync`
Request: `{ ops: Op[] }` (≤ 50). Response: `{ results: [{ opId, status, code?, record? }] }`

Per operation, inside one transaction:
1. `INSERT INTO processed_operations … ON CONFLICT DO NOTHING`. If the op id already exists, return the
   stored result (`status: "duplicate"`). This makes network retries harmless.
2. Resolve membership: the authenticated device must own an *active* participant in `challengeId`.
3. Apply. Upserts compare `updated_at`: if the server copy is newer the op returns `stale` with the
   server record, which the client adopts (last-write-wins).
4. Store the result in `processed_operations`.

Status handling on the client:

| status | client action |
| --- | --- |
| `ok`, `duplicate` | remove op, mark entity `synced` |
| `stale` | remove op, overwrite local entity with `record` |
| `rejected` (validation/forbidden) | keep op as `failed`, mark entity `failed`, show banner |
| network error / 5xx / 429 | keep op `pending`, `attempts++`, `nextAttemptAt = now + backoff` |
| 401/403 membership `removed` | mark challenge `access = removed` |

Backoff: `min(2s × 2^attempts, 5 min)` with ±20% jitter.

## Pull — `GET /api/challenges/:id/sync?since=<cursor>`
Returns challenge, participants, goals, books, sessions, reactions with
`server_updated_at > since − 30s` (overlap absorbs commit-order skew; merges are idempotent),
including tombstones. Without `since` the full live dataset is returned. The response `cursor` is the
server time at query start.

Merge rule: a pulled row never overwrites a local row whose `syncStatus` is `pending`/`failed`
(the queued op will settle it).

## Engine (`src/local/sync/engine.ts`)
* **Single flight**: an in-memory promise plus `navigator.locks` (`stillreading-sync`) across tabs.
* **Triggers**: app start, `online`, tab becomes visible, 400 ms after any local mutation, and every
  30 s while visible (pull keeps the crew feed fresh).
* Order per run: push all due ops (in creation order, batches of 50) → pull each joined challenge.
* State exposed to UI (`useSyncState`): `online`, `syncing`, `pendingCount`, `failedCount`, `lastError`.

## Conflicts
One device per participant is the MVP assumption. Sessions are immutable; books/goals/profile are
last-write-wins by `updated_at`; reactions are idempotent `set(active)`. No CRDTs.

## Book covers

Covers are filled in on the server so every member sees them, whoever added the book.
`POST /api/challenges/:id/covers` (any member; rate limited per device) looks up to 12 coverless
books on Open Library and saves the result onto the book (`cover_lookup` = found / missing,
`cover_checked_at`, bumping `server_updated_at` so the cover arrives on everyone's next pull). The
client calls it when it sees books without covers (at most every 10 minutes unless more appear).

- Clients only send `coverUrl` in `book.upsert` when the reader changed it, so routine progress
  updates never clobber a cover the server found.
- An explicit `coverUrl: null` over an existing cover marks it `removed`: never looked up again.
  Exception: a null written before the server found the cover (older clients that always send the
  field) is ignored.
- Misses are retried after 7 days; correcting a coverless book's title or author retries at once.
