import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChallengeSnapshot, PushResult } from "@/lib/api-types";
import { newId } from "@/lib/ids";
import type { Database } from "@/db/client";
import { api, bookInput, createBody, freshDb, joinBody, newDevice, resetDb, type TestDevice } from "../helpers/server";

const realFetch = globalThis.fetch;
const COVERS: Record<string, number> = { "atomic habits": 12539702, "red rising": 7222246 };
let calls: URL[] = [];
let down = false;

beforeAll(async () => {
  db = await freshDb();
});

let db: Database;
let host: TestDevice;
let friend: TestDevice;
let snap: ChallengeSnapshot;

beforeEach(async () => {
  await resetDb(db);
  calls = [];
  down = false;
  // Open Library stub: knows a couple of titles, nothing else.
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push(url);
    if (down) throw new TypeError("fetch failed");
    const id = COVERS[(url.searchParams.get("title") ?? "").toLowerCase()];
    return Response.json({ docs: id ? [{ key: "/works/OL1W", title: url.searchParams.get("title"), cover_i: id }] : [] });
  }) as typeof fetch;
  host = newDevice();
  friend = newDevice();
  snap = (await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body: createBody() })).body;
  await api("POST", `/api/join/${snap.challenge.joinCode}`, { device: friend, body: joinBody("Temi") });
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const cover = (id: number) => `https://covers.openlibrary.org/b/id/${id}-M.jpg`;
const fill = (device: TestDevice) => api<{ filled: number }>("POST", `/api/challenges/${snap.challenge.id}/covers`, { device });
const pull = async (device: TestDevice) => (await api<ChallengeSnapshot>("GET", `/api/challenges/${snap.challenge.id}/sync`, { device })).body;
const push = (device: TestDevice, payload: Record<string, unknown>) =>
  api<{ results: PushResult[] }>("POST", "/api/sync", { device, body: { ops: [{ opId: newId("op"), challengeId: snap.challenge.id, type: "book.upsert", payload }] } });

describe("POST /api/challenges/:id/covers", () => {
  it("saves covers onto everyone's books, so every member sees them", async () => {
    const red = { ...bookInput("Red Rising"), author: "Pierce Brown" };
    const journal = { ...bookInput("My Handwritten Journal"), author: null };
    await push(friend, red);
    await push(friend, journal);

    // The host fills covers for the friend's books (and their own).
    expect((await fill(host)).body).toEqual({ filled: 2 });
    const byTitle = Object.fromEntries((await pull(friend)).books.map((b) => [b.title, b.coverUrl]));
    expect(byTitle).toEqual({ "Atomic Habits": cover(12539702), "Red Rising": cover(7222246), "My Handwritten Journal": null });

    // Misses are remembered: nothing left to look up.
    calls = [];
    expect((await fill(friend)).body).toEqual({ filled: 0 });
    expect(calls).toHaveLength(0);
  });

  it("keeps a found cover against older clients, but respects a reader removing it", async () => {
    const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
    const red = { ...bookInput("Red Rising"), author: "Pierce Brown", createdAt: ago(10), updatedAt: ago(10) };
    await push(friend, red);
    await fill(host);

    // An older client that always sends coverUrl, writing a change made before the cover was found.
    const stale = (await push(friend, { ...red, coverUrl: null, currentPage: 40, updatedAt: ago(5) })).body.results[0];
    expect(stale).toMatchObject({ status: "ok", entity: { record: { currentPage: 40, coverUrl: cover(7222246) } } });

    // Removed on purpose afterwards: stays removed, even after another fill.
    const removed = (await push(friend, { ...red, coverUrl: null, updatedAt: new Date(Date.now() + 60_000).toISOString() })).body.results[0];
    expect(removed).toMatchObject({ status: "ok", entity: { record: { coverUrl: null } } });
    expect((await fill(host)).body).toEqual({ filled: 0 });
    expect((await pull(friend)).books.find((b) => b.id === red.id)?.coverUrl).toBeNull();
  });

  it("looks again after the title is corrected", async () => {
    const typo = { ...bookInput("Red Risng"), author: "Pierce Brown" };
    await push(friend, typo);
    expect((await fill(friend)).body).toEqual({ filled: 1 }); // Atomic Habits only
    await push(friend, { ...typo, title: "Red Rising", updatedAt: new Date(Date.now() + 1000).toISOString() });
    expect((await fill(friend)).body).toEqual({ filled: 1 });
  });

  it("leaves books unchecked when Open Library is down", async () => {
    down = true;
    expect((await fill(host)).body).toEqual({ filled: 0 });
    down = false;
    expect((await fill(host)).body).toEqual({ filled: 1 });
  });

  it("is only open to members", async () => {
    const res = await fill(newDevice());
    expect(res.status).toBe(404);
  });
});
