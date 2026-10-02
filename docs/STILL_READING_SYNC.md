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
| `reply.create` | self | id, sessionId, body (check-in must be in this challenge and not deleted) |
| `reply.delete` | self (author only) | id, updatedAt |
| `reply.like` | self | id (derived), replyId, active, updatedAt |
| `challenge.update` | host | name, description |
| `challenge.archive` | host | — |
| `participant.remove` | host | participantId |
| `participant.merge` | host | fromId, intoId: moves fromId's check-ins, books, replies, reactions and likes to intoId, then removes fromId (never the host) |

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
Returns challenge, participants, goals, books, sessions, reactions, replies, replyLikes with
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

## Reply notifications (Web Push)

Readers opt in per challenge (Settings, or the prompt after a check-in / in a thread they follow).
`PUT /api/challenges/:id/notifications { enabled, subscription? }` stores this device's push
subscription (`push_subscriptions`, keyed by endpoint) and sets `challenge_participants.notify_replies`.
`GET` returns `{ enabled, thisDevice }`; `GET /api/push/config` returns the public VAPID key or null.

- Endpoints must be HTTPS on a browser vendor's push service (FCM, Mozilla, Apple, Windows), because
  the server sends requests to them.
- After a `reply.create` commits, `notifyReply` runs in the background (`waitUntil`). It claims the
  reply once (`replies.notified_at`), so retried ops never notify twice. It then sends to the
  check-in's owner, the author of the reply being answered ("replied to you") and everyone who
  replied in the thread, minus the replier, limited to active
  members with `notify_replies`. Sends go to every subscription on the member's device or any device
  of the same reader. Payload: `{ title, body (≤140), url: /c/:id/feed/:sessionId, tag: thread-:sessionId }`,
  TTL 24h, `Topic` = session id so a phone that's offline gets one message per thread.
- 404/410 from the push service deletes the subscription. Without VAPID keys nothing is sent.
- The service worker shows the notification (`tag` replaces older ones for the same thread) and on
  tap focuses an open window and navigates it to `url`, or opens a new one. Only same-origin paths
  are opened.
- iPhone/iPad: only the Home Screen app (iOS 16.4+) can subscribe; Safari tabs get an install hint.

## Book covers

Covers are filled in on the server so every member sees them, whoever added the book.
`POST /api/challenges/:id/covers` (any member; rate limited per device) looks up 3 coverless
books on Open Library and saves the result onto the book (`cover_lookup` = found / missing,
`cover_checked_at`, bumping `server_updated_at` so the cover arrives on everyone's next pull). The
client calls it repeatedly, a batch at a time, when it sees books without covers (at most every 10 minutes unless more appear), skipping lookups that failed.

- Clients only send `coverUrl` in `book.upsert` when the reader changed it, so routine progress
  updates never clobber a cover the server found.
- An explicit `coverUrl: null` over an existing cover marks it `removed`: never looked up again.
  Exception: a null written before the server found the cover (older clients that always send the
  field) is ignored.
- The lookup widens step by step (10 results each): title + author, a keyword search of both, the
  title without its subtitle, then the title alone. Loose searches also return unrelated books, so a
  result only counts when it is the same book (`sameBook` in `src/lib/book-match.ts`): the title
  matches, ignoring case, punctuation, a leading article, a subtitle and a small typo, and one of its
  authors shares the reader's author's surname. No cover beats a wrong cover.
- A cover the reader picks is marked `picked`, so it is never cleared or replaced by a lookup. The app asks for the
  author whenever a book is added, since the title alone often matches the wrong edition.
- Misses are retried after 3 days; correcting a coverless book's title or author retries at once.
- A cover image that fails to load is retried twice (by the proxy and by the page) before the app
  falls back to the generated cover.
- Images are served from our own origin: a stored `https://covers.openlibrary.org/b/id/<id>-<size>.jpg`
  is rendered as `/covers/<id>-<size>.jpg` (`coverSrc`), a route that fetches the cover server-side
  (following Open Library's redirect to archive.org) and returns it with a one-year immutable cache.
  Phones never load Open Library directly, and the service worker caches only real 200 responses
  (`stillreading-cover-images`). Its old cross-origin cover cache, which could pin opaque failed
  loads, is deleted on activate.

## App updates

The service worker activates new versions immediately (`skipWaiting` + `clientsClaim`), but an
installed app can stay suspended for days without the browser checking for one. `AppUpdater` calls
`registration.update()` on launch and whenever the app returns to the foreground. When a new worker
takes over it reloads at once if the app is in the background, otherwise shows a "new version"
toast, and reloads on the next return to the foreground. Settings shows the build id and an
"Update app" button that checks, waits for the new worker and reloads.

## Open in the app (browser → installed app)

Phones don't let a website launch a Home Screen web app, and on iPhone Safari and the installed app
don't share storage. So a phone browser shows an "Open in the app" bar. Its sheet copies a one-time
link, `/continue#t=<token>&k=<key>&to=<path>`, and the app picks it up with "Paste from browser"
(on the landing page and in Settings).

- The browser syncs pending progress first, then seals `{ pass }` (the Reading Pass) with a random
  AES key `k` and parks the sealed blob with `POST /api/handoff`. The server stores only the blob
  and a sha256 of the token, for 15 minutes, single use. `k` only exists in the URL fragment.
- The app collects it with `POST /api/handoff/claim`, opens it with `k` and runs the normal Reading
  Pass claim, so the app becomes the same reader, with challenges, books and private reflections.
- On Android the manifest's `launch_handler` / `handle_links` make links tapped in other apps open
  in the installed app. Chrome and the installed app share storage there, so nothing needs copying.
