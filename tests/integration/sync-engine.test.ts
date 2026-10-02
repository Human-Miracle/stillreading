import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { count } from "drizzle-orm";
import { readingSessions } from "@/db/schema";
import type { Database } from "@/db/client";
import { configureApi } from "@/local/api";
import { StillReadingDB, getLocalDb, setLocalDb } from "@/local/db";
import { resetDeviceCache } from "@/local/device";
import * as repo from "@/local/repo";
import { SyncEngine } from "@/local/sync/engine";
import { freshDb, handlerFetch, resetDb } from "../helpers/server";

let server: Database;
let online = true;
let clock = Date.now();
/** Drop the response after the server processed the request (network cut mid-sync). */
let loseNextResponse = false;
/** Make the server look broken. */
let serverDown = false;

const flakyFetch: typeof fetch = async (input, init) => {
  if (!online) throw new TypeError("Failed to fetch");
  if (serverDown) return new Response(JSON.stringify({ error: { code: "server_error", message: "down" } }), { status: 503 });
  const res = await handlerFetch(input, init);
  if (loseNextResponse) {
    loseNextResponse = false;
    throw new TypeError("network connection was lost");
  }
  return res;
};

let dbCounter = 0;
/** A fresh "browser profile" (own IndexedDB + device identity). */
function newBrowser() {
  const name = `stillreading-test-${++dbCounter}`;
  setLocalDb(new StillReadingDB(name));
  resetDeviceCache();
  return name;
}

/** Re-open the same IndexedDB as if the browser was closed and reopened. */
function reopenBrowser(name: string) {
  getLocalDb().close();
  setLocalDb(new StillReadingDB(name));
  resetDeviceCache();
  return new SyncEngine({ isOnline: () => online, now: () => clock, random: () => 0.5 });
}

const engine = () => new SyncEngine({ isOnline: () => online, now: () => clock, random: () => 0.5 });

async function serverSessionCount() {
  const [row] = await server.select({ n: count() }).from(readingSessions);
  return Number(row!.n);
}

async function hostChallenge() {
  const tz = "Africa/Lagos";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const snap = await repo.createChallenge({
    name: "October Reading Challenge",
    description: "",
    startDate: today,
    durationDays: 30,
    timezone: tz,
    host: { displayName: "Jessica", goal: { kind: "pages_per_day", value: 20 }, book: { title: "Atomic Habits", totalPages: 320 } },
  });
  return snap;
}

beforeAll(async () => {
  server = await freshDb();
  configureApi({ fetch: flakyFetch, baseUrl: "" });
});

beforeEach(async () => {
  await resetDb(server);
  online = true;
  serverDown = false;
  loseNextResponse = false;
  clock = Date.now();
});

describe("local-first sync engine", () => {
  it("logs reading offline, survives a restart, syncs on reconnect without duplicates", async () => {
    const name = newBrowser();
    const snap = await hostChallenge();
    const challengeId = snap.challenge.id;
    const bookId = snap.books[0]!.id;

    online = false;
    const session = await repo.logReading({ challengeId, bookId, amount: 18, unit: "pages", reflection: "Identity chapter!" });
    let s = engine();
    await s.sync();
    expect(s.state.online).toBe(false);
    expect((await getLocalDb().sessions.get(session.id))?.syncStatus).toBe("pending");
    expect(await getLocalDb().syncQueue.count()).toBeGreaterThan(0);

    // Browser closes and reopens, still offline.
    s = reopenBrowser(name);
    const stored = await getLocalDb().sessions.get(session.id);
    expect(stored).toMatchObject({ amount: 18, reflection: "Identity chapter!", syncStatus: "pending" });
    expect((await getLocalDb().books.get(bookId))?.currentPage).toBe(18);

    online = true;
    await s.sync();
    expect((await getLocalDb().sessions.get(session.id))?.syncStatus).toBe("synced");
    expect(await getLocalDb().syncQueue.count()).toBe(0);
    expect(await serverSessionCount()).toBe(1);

    await s.sync();
    expect(await serverSessionCount()).toBe(1);
  });

  it("syncs multiple queued check-ins in order", async () => {
    newBrowser();
    const snap = await hostChallenge();
    online = false;
    for (const amount of [5, 7, 9]) await repo.logReading({ challengeId: snap.challenge.id, bookId: null, amount, unit: "pages" });
    const book = await repo.addBook(snap.challenge.id, { title: "Deep Work" });
    await repo.logReading({ challengeId: snap.challenge.id, bookId: book.id, amount: 3, unit: "chapters" });
    online = true;
    await engine().sync();
    expect(await serverSessionCount()).toBe(4);
    expect(await getLocalDb().syncQueue.count()).toBe(0);
  });

  it("network cut after the server applied the op: retry is recognised as a duplicate", async () => {
    newBrowser();
    const snap = await hostChallenge();
    await repo.logReading({ challengeId: snap.challenge.id, bookId: null, amount: 12, unit: "pages" });
    const s = engine();
    loseNextResponse = true;
    await s.sync();
    expect(await serverSessionCount()).toBe(1);
    expect(await getLocalDb().syncQueue.count()).toBe(1);
    const op = (await getLocalDb().syncQueue.toArray())[0]!;
    expect(op.attempts).toBe(1);

    clock += 60_000; // past the backoff
    await s.sync();
    expect(await getLocalDb().syncQueue.count()).toBe(0);
    expect(await serverSessionCount()).toBe(1);
  });

  it("transient server failures back off exponentially and never drop the op", async () => {
    newBrowser();
    const snap = await hostChallenge();
    await repo.logReading({ challengeId: snap.challenge.id, bookId: null, amount: 12, unit: "pages" });
    const s = engine();
    serverDown = true;
    await s.sync();
    let op = (await getLocalDb().syncQueue.toArray())[0]!;
    expect(op).toMatchObject({ attempts: 1, status: "pending" });
    expect(op.nextAttemptAt - clock).toBe(2000);

    await s.sync(); // not due yet: no attempt
    expect((await getLocalDb().syncQueue.toArray())[0]!.attempts).toBe(1);

    clock += 2_000;
    await s.sync();
    op = (await getLocalDb().syncQueue.toArray())[0]!;
    expect(op.attempts).toBe(2);
    expect(op.nextAttemptAt - clock).toBe(4000);
    expect(s.state.lastError).toBeTruthy();

    serverDown = false;
    clock += 4_000;
    await s.sync();
    expect(await getLocalDb().syncQueue.count()).toBe(0);
    expect(await serverSessionCount()).toBe(1);
  });

  it("validation failures are kept as failed and surfaced, not dropped", async () => {
    newBrowser();
    const snap = await hostChallenge();
    const session = await repo.logReading({ challengeId: snap.challenge.id, bookId: null, amount: 12, unit: "pages", date: "2020-01-01" });
    const s = engine();
    await s.sync();
    expect(s.state.failedCount).toBe(1);
    expect((await getLocalDb().sessions.get(session.id))?.syncStatus).toBe("failed");
    const [op] = await getLocalDb().syncQueue.toArray();
    expect(op).toMatchObject({ status: "failed", lastError: "That date isn't part of this challenge." });

    await repo.discardFailed(op!.opId);
    expect(await getLocalDb().sessions.get(session.id)).toBeUndefined();
  });

  it("concurrent sync calls are single-flight", async () => {
    newBrowser();
    const snap = await hostChallenge();
    await repo.logReading({ challengeId: snap.challenge.id, bookId: null, amount: 12, unit: "pages" });
    const s = engine();
    await Promise.all([s.sync(), s.sync(), s.sync()]);
    expect(await serverSessionCount()).toBe(1);
    expect(await getLocalDb().syncQueue.count()).toBe(0);
  });

  it("private reflections never leave the device", async () => {
    newBrowser();
    const snap = await hostChallenge();
    const session = await repo.logReading({ challengeId: snap.challenge.id, bookId: null, amount: 12, unit: "pages", reflection: "just for me", reflectionShared: false });
    await engine().sync();
    const [row] = await server.select().from(readingSessions);
    expect(row!.reflection).toBeNull();
    expect((await getLocalDb().sessions.get(session.id))?.reflection).toBe("just for me");
  });

  it("friends see each other's check-ins and reactions after sync", async () => {
    newBrowser();
    const snap = await hostChallenge();
    const hostDb = getLocalDb();
    const s1 = engine();
    const session = await repo.logReading({ challengeId: snap.challenge.id, bookId: null, amount: 20, unit: "pages", reflection: "So good" });
    await s1.sync();

    // Friend on a separate browser.
    newBrowser();
    const joined = await repo.joinChallenge(snap.challenge.joinCode, { displayName: "David", goal: { kind: "minutes_per_day", value: 30 } });
    const friendDb = getLocalDb();
    expect(await friendDb.participants.count()).toBe(2);
    expect((await friendDb.sessions.get(session.id))?.reflection).toBe("So good");
    await repo.setReaction(snap.challenge.id, session.id, "fire", true);
    await repo.addReply(snap.challenge.id, session.id, "Which chapter was that?");
    await engine().sync();

    // Back to the host.
    setLocalDb(hostDb);
    resetDeviceCache();
    await s1.sync();
    const reactions = await hostDb.reactions.where("sessionId").equals(session.id).toArray();
    expect(reactions).toHaveLength(1);
    expect(reactions[0]).toMatchObject({ type: "fire", participantId: joined.me.participantId });
    const replies = await hostDb.replies.where("sessionId").equals(session.id).toArray();
    expect(replies).toEqual([expect.objectContaining({ body: "Which chapter was that?", participantId: joined.me.participantId, syncStatus: "synced" })]);
  });

  it("a removed participant loses access locally", async () => {
    newBrowser();
    const snap = await hostChallenge();
    const hostDb = getLocalDb();
    newBrowser();
    const joined = await repo.joinChallenge(snap.challenge.joinCode, { displayName: "Samuel", goal: { kind: "every_day", value: 1 } });
    const friendDb = getLocalDb();

    setLocalDb(hostDb);
    resetDeviceCache();
    await repo.removeParticipant(snap.challenge.id, joined.me.participantId);
    await engine().sync();

    setLocalDb(friendDb);
    resetDeviceCache();
    await engine().sync();
    expect((await friendDb.challenges.get(snap.challenge.id))?.access).toBe("removed");
  });
});
