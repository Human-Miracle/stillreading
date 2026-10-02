import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { configureApi } from "@/local/api";
import { StillReadingDB, setLocalDb } from "@/local/db";
import { resetDeviceCache } from "@/local/device";
import { completeHandoff, createHandoffLink, parseHandoff, safePath } from "@/local/handoff";
import { getLocalReader } from "@/local/reader";
import * as repo from "@/local/repo";
import { SyncEngine } from "@/local/sync/engine";
import { freshDb, handlerFetch, resetDb } from "../helpers/server";

const ORIGIN = "https://stillreading.test";
let server: Database;
let n = 0;
function device() {
  const db = new StillReadingDB(`handoff-client-${++n}`);
  setLocalDb(db);
  resetDeviceCache();
  return db;
}
function use(db: StillReadingDB) {
  setLocalDb(db);
  resetDeviceCache();
}

beforeAll(async () => {
  server = await freshDb();
  configureApi({ fetch: handlerFetch, baseUrl: "" });
});
beforeEach(async () => {
  await resetDb(server);
});

describe("open in the app", () => {
  it("carries the reader and their progress from the browser into the app", async () => {
    const safari = device();
    const tz = "Africa/Lagos";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const snap = await repo.createChallenge({ name: "October", description: "", startDate: today, durationDays: 30, timezone: tz, host: { displayName: "Jess", goal: { kind: "pages_per_day", value: 100 } } });
    const read = await repo.logReading({ challengeId: snap.challenge.id, bookId: null, amount: 42, unit: "pages", reflectionShared: true });
    await new SyncEngine({ isOnline: () => true }).sync();

    const link = await createHandoffLink(`/c/${snap.challenge.id}`, ORIGIN);
    expect(link).toMatch(new RegExp(`^${ORIGIN}/continue#`));
    const safariReader = await getLocalReader();

    const app = device();
    const handoff = parseHandoff(link, ORIGIN)!;
    expect(handoff.token).toBeTruthy();
    expect(await completeHandoff(handoff)).toBe(`/c/${snap.challenge.id}`);
    expect((await app.sessions.get(read.id))?.amount).toBe(42);
    expect((await getLocalReader())?.readerId).toBe(safariReader?.readerId);

    // One use only.
    use(device());
    await expect(completeHandoff(handoff)).rejects.toThrow();
    use(safari);
  });

  it("passes plain links through and ignores other sites", () => {
    expect(parseHandoff(`${ORIGIN}/join/AbC123xyz789`, ORIGIN)).toEqual({ token: null, key: null, to: "/join/AbC123xyz789" });
    expect(parseHandoff("https://evil.example/continue#to=/c/x", ORIGIN)).toBeNull();
    expect(parseHandoff("MAPLE TIDE", ORIGIN)).toBeNull();
    expect(safePath("//evil.example")).toBeNull();
    expect(safePath("/c/ch_01ARZ3NDEKTSV4RRFFQ69G5FAV/feed")).toBe("/c/ch_01ARZ3NDEKTSV4RRFFQ69G5FAV/feed");
  });
});
