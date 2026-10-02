import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChallengeSnapshot, PushResult } from "@/lib/api-types";
import { newId } from "@/lib/ids";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { books } from "@/db/schema";
import { api, bookInput, createBody, freshDb, joinBody, newDevice, resetDb, type TestDevice } from "../helpers/server";

const realFetch = globalThis.fetch;
const COVERS: Record<string, { id: number; author: string }> = { "atomic habits": { id: 12539702, author: "James Clear" }, "red rising": { id: 7222246, author: "Pierce Brown" } };
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
    const hit = COVERS[(url.searchParams.get("title") ?? "").toLowerCase()];
    return Response.json({ docs: hit ? [{ key: "/works/OL1W", title: url.searchParams.get("title"), author_name: [hit.author], cover_i: hit.id }] : [] });
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
type Fill = { filled: number; checked: number; remaining: number; failed: string[] };
const fillOnce = (device: TestDevice, skip: string[] = []) => api<Fill>("POST", `/api/challenges/${snap.challenge.id}/covers`, { device, body: { skip } });
/** What the app does: keep asking until nothing is left, skipping failures. */
async function fill(device: TestDevice) {
  const total = { filled: 0, failed: [] as string[] };
  for (let i = 0; i < 20; i++) {
    const res = await fillOnce(device, total.failed);
    if (res.status !== 200) return { status: res.status, body: total };
    total.filled += res.body.filled;
    total.failed.push(...res.body.failed);
    if (!res.body.remaining) break;
  }
  return { status: 200, body: { filled: total.filled } };
}
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

  it("works in small batches", async () => {
    for (const t of ["Red Rising", "Golden Son", "Morning Star", "Iron Gold"]) await push(friend, { ...bookInput(t), author: "Pierce Brown" });
    const first = (await fillOnce(host)).body;
    expect(first).toMatchObject({ filled: 2, checked: 3, remaining: 2, failed: [] }); // Atomic Habits, Red Rising, Golden Son
    expect((await fillOnce(host)).body).toMatchObject({ filled: 0, checked: 2, remaining: 0 });
  });

  it("leaves books unchecked when Open Library is down", async () => {
    down = true;
    const res = (await fillOnce(host)).body;
    expect(res).toMatchObject({ filled: 0, checked: 0, failed: [snap.books[0]!.id] });
    down = false;
    expect((await fill(host)).body).toEqual({ filled: 1 });
  });

  it("widens the search when the strict title + author search finds no cover", async () => {
    // Open Library stub: the strict title search only finds coverless editions; a keyword search,
    // or a search without the subtitle, finds the cover further down the results.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      calls.push(url);
      const [q, title] = [url.searchParams.get("q"), url.searchParams.get("title")];
      const coverless = Array.from({ length: 4 }, (_, i) => ({ key: `/works/OL${i}W`, title: title ?? q }));
      if (q === "The Psychology of Money Morgan Housel") return Response.json({ docs: [...coverless, { key: "/works/OL9W", title: "The Psychology of Money", author_name: ["Morgan Housel"], cover_i: 10521270 }] });
      if (title === "Dune" && url.searchParams.get("author") === "Frank Herbert") return Response.json({ docs: [{ key: "/works/OL8W", title: "Dune", author_name: ["Frank Herbert"], cover_i: 11481354 }] });
      return Response.json({ docs: coverless });
    }) as typeof fetch;
    await push(friend, { ...bookInput("The Psychology of Money"), author: "Morgan Housel" });
    await push(friend, { ...bookInput("Dune (Dune Chronicles #1)"), author: "Frank Herbert" });

    await fill(host);
    const byTitle = Object.fromEntries((await pull(friend)).books.map((b) => [b.title, b.coverUrl]));
    expect(byTitle["The Psychology of Money"]).toBe(cover(10521270));
    expect(byTitle["Dune (Dune Chronicles #1)"]).toBe(cover(11481354));
    expect(calls.every((u) => u.searchParams.get("limit") === "10")).toBe(true);
  });

  it("never takes another book's cover from a loose search", async () => {
    // Open Library doesn't have the book: its keyword and title searches return other books, with covers.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(new URL(String(input instanceof Request ? input.url : input)));
      return Response.json({
        docs: [
          { key: "/works/OL1W", title: "The Writer's Resource", author_name: ["Susan Day"], cover_i: 111 },
          { key: "/works/OL2W", title: "Thank You for Remembering Me", author_name: ["Ann Lee"], cover_i: 222 },
          { key: "/works/OL3W", title: "Thank You for Remembering", author_name: ["Someone Else"], cover_i: 333 },
        ],
      });
    }) as typeof fetch;
    const book = { ...bookInput("Thank you for remembering"), author: "Emily Harding" };
    await push(friend, book);
    await fill(host);
    expect((await pull(friend)).books.find((b) => b.id === book.id)?.coverUrl).toBeNull();
  });

  it("a cover the reader picks is theirs: never cleared or replaced by a lookup", async () => {
    const red = { ...bookInput("Red Rising"), author: "Pierce Brown" };
    await push(friend, red);
    await fill(host);
    const picked = "https://covers.openlibrary.org/b/id/999-M.jpg";
    await push(friend, { ...red, coverUrl: picked, updatedAt: new Date(Date.now() + 1000).toISOString() });
    const [row] = await db.select().from(books).where(eq(books.id, red.id));
    expect(row).toMatchObject({ coverUrl: picked, coverLookup: "picked" });
  });

  it("is only open to members", async () => {
    const res = await fill(newDevice());
    expect(res.status).toBe(404);
  });
});
