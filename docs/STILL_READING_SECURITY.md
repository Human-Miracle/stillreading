# Still Reading — Security review

Review of the whole platform (API, identity, Reading Pass, encryption, client, PWA, headers,
dependencies). Date: 2026-10-01. Regression tests: `tests/integration/security.test.ts`,
`tests/integration/reading-pass*.test.ts`.

## Threat model
No accounts by design. Identity is a device secret (256-bit, stored hashed) plus an optional Reading
Pass (≈50-bit word phrase) that links devices to a reader. Shared challenge data is visible to members;
private reflections are end-to-end encrypted. Attackers considered: strangers on the internet, a member
of your challenge, someone who gets a lost/stolen phone, someone who sees a leaked pass, and someone who
obtains a copy of the database.

## Findings fixed in this review

| Severity | Finding | Fix |
| --- | --- | --- |
| High | A lost/stolen phone kept access after recovery: membership checks also matched the device that originally created the membership, so a host re-invite didn't revoke the old phone. Making a new Reading Pass didn't sign out a device that had used a leaked pass. | Membership now follows the reader; the original device only counts for memberships never linked to a reader. Making a new pass detaches every other device. Tests prove the old phone and a thief's device are rejected. |
| Medium | Unbounded registration: any request with a fresh random device id wrote database rows before any limit (per-device limits were bypassable by rotating ids). | New-device registration limited per IP; per-IP ceilings added to sync, pull and reader endpoints. |
| Medium | Rate limits keyed on the first `X-Forwarded-For` value, which a client can set. | Prefer platform-set `x-vercel-forwarded-for` / `x-real-ip`. |
| Medium | No Content-Security-Policy, while device secret, pass and note key live in IndexedDB. | Strict CSP: same-origin scripts/connections/frames, images only from self and Open Library covers; plus HSTS and a wider Permissions-Policy. (COOP was tried and removed: it stops pages loading in Instagram/Facebook in-app browsers on iOS.) Verified no violations across all pages. |
| Low | Host re-invite token in the query string (lands in request logs and history). | Moved to the URL fragment (`/pass#reinvite=…`), never sent to the server. |
| Low | Pass from a QR scan stayed in the address bar/history. | Wiped with `history.replaceState` as soon as it's read. |
| Low | Test-only rate-limit kill switch would also work in production. | Ignored on Vercel. |
| Low | Demo seed (fixed, guessable invite code) could be run against the real database. | Refuses unless `--force` when `DATABASE_URL` is set. |
| Low | `browserslist` advisory via the service-worker build tool (build-time only). | Overridden to a patched version; `npm audit --omit=dev` reports 0 vulnerabilities. |

## Verified as sound
* Every endpoint validates input with Zod; bodies capped at 256 KB; batch ops capped at 50.
* No SQL injection paths: Drizzle parameterises everything, including the raw merge SQL.
* Authorization is server-side for every mutation: owner checks on books/sessions/reactions/replies, host
  checks on rename/archive/remove/re-invite; removed members get 403; device ids never leave the server.
* Idempotency: op ids are random 80-bit and scoped to the device that used them.
* Secrets: device secret stored as SHA-256, compared in constant time; pass stored only as scrypt
  (N=2¹⁴, r=8); re-invite tokens 144-bit, hashed, single use, 7-day expiry; only `DATABASE_URL` is
  configured and nothing is exposed to the client bundle.
* Private reflections: AES-256-GCM with random IVs; note key wrapped with PBKDF2-SHA-256 (310k);
  only sealed text is accepted by the server and it's returned only to the owner.
* No XSS sinks with user data (React escaping; the only raw HTML is QR SVG from our own URL);
  cover images restricted to `covers.openlibrary.org`; the book-search proxy can only reach Open Library.
* CSRF: API calls need custom device headers, which cross-site pages can't send without CORS approval
  (none is granted). Clickjacking blocked by `frame-ancestors 'none'` + `X-Frame-Options`.
* Service worker never caches `/api/*`.

## Accepted risks (by design, or for later)
* **No accounts**: whoever holds a device, its pass, or a re-invite link *is* that reader. Making a new
  pass or a host re-invite is the recovery path.
* A removed member can rejoin from a fresh device with the invite link (no identity to ban); the host
  can remove them again or archive the challenge.
* `script-src 'unsafe-inline'` is required by Next.js streaming without per-request nonces; moving to a
  nonce-based CSP would make every page dynamic. The other directives still block loading external
  code and sending data off-site.
* Rate limits are fixed-window counters in Postgres; a large distributed botnet could still spend
  some quota. Upstream protection (Vercel Firewall / WAF rules) is the next layer if needed.
* If someone copies the whole database, cracking a single pass offline costs ~2⁵⁰ slow hashes; private
  reflections stay safe unless that happens.
