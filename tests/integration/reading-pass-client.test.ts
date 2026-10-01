import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { readingSessions } from "@/db/schema";
import type { Database } from "@/db/client";
import { configureApi } from "@/local/api";
import { openNote, sealNote, unwrapNoteKey, wrapNoteKey, newNoteKey } from "@/local/crypto";
import { StillReadingDB, getLocalDb, setLocalDb } from "@/local/db";
import { resetDeviceCache } from "@/local/device";
import { claimWithPass, ensureReadingPass, getLocalReader, rotatePass } from "@/local/reader";
import * as repo from "@/local/repo";
import { SyncEngine } from "@/local/sync/engine";
import { PASS_PATTERN, normalizePass } from "@/lib/pass";
import { freshDb, handlerFetch, resetDb } from "../helpers/server";

let server: Database;
let n = 0;

function browser() {
  const db = new StillReadingDB(`pass-client-${++n}`);
  setLocalDb(db);
  resetDeviceCache();
  return db;
}
function use(db: StillReadingDB) {
  setLocalDb(db);
  resetDeviceCache();
}
const sync = () => new SyncEngine({ isOnline: () => true }).sync();

beforeAll(async () => {
  server = await freshDb();
  configureApi({ fetch: handlerFetch, baseUrl: "" });
});
beforeEach(async () => {
  await resetDb(server);
});

describe("note crypto", () => {
  it("seals, wraps and unwraps", async () => {
    const key = newNoteKey();
    const sealed = await sealNote("The identity chapter 💛", key);
    expect(sealed).toMatch(/^v1\./);
    expect(await openNote(sealed, key)).toBe("The identity chapter 💛");
    const wrapped = await wrapNoteKey(key, "MAPLE-TIDE-LANTERN-ORBIT-58");
    expect(await unwrapNoteKey(wrapped, "MAPLE-TIDE-LANTERN-ORBIT-58")).toBe(key);
    await expect(unwrapNoteKey(wrapped, "MAPLE-TIDE-LANTERN-ORBIT-59")).rejects.toThrow();
  });

  it("normalizes passes however people type them", () => {
    expect(normalizePass(" maple tide, lantern orbit 58 ")).toBe("MAPLE-TIDE-LANTERN-ORBIT-58");
    expect(normalizePass("maple-tide-lantern-orbit58")).toBe("MAPLE-TIDE-LANTERN-ORBIT-58");
    expect(PASS_PATTERN.test("MAPLE-TIDE-LANTERN-ORBIT-58")).toBe(true);
  });
});

describe("Reading Pass across devices", () => {
  it("existing reader gets a pass; a new phone continues with progress and private reflections", async () => {
    // Phone A: an existing reader from before the pass existed, with a private reflection.
    const phoneA = browser();
    const tz = "Africa/Lagos";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const snap = await repo.createChallenge({ name: "October", description: "", startDate: today, durationDays: 30, timezone: tz, host: { displayName: "Miracle", goal: { kind: "pages_per_day", value: 20 } } });
    const old = await repo.logReading({ challengeId: snap.challenge.id, bookId: null, amount: 10, unit: "pages", reflection: "Only for me", reflectionShared: false });
    await sync();
    expect((await getLocalDb().sessions.get(old.id))?.privateSynced).toBe(false);

    // The pass is created automatically and old private notes are sealed + uploaded.
    const reader = await ensureReadingPass();
    expect(reader?.pass).toMatch(PASS_PATTERN);
    await sync();
    const [row] = await server.select().from(readingSessions).where(eq(readingSessions.id, old.id));
    expect(row!.privateReflection).toMatch(/^v1\./);
    expect(row!.privateReflection).not.toContain("Only for me");
    expect(row!.reflection).toBeNull();

    // Phone B: types the pass (any case/spacing) and carries on.
    const phoneB = browser();
    const ids = await claimWithPass(reader!.pass!.toLowerCase().replace(/-/g, " "));
    expect(ids).toEqual([snap.challenge.id]);
    const onB = await getLocalDb().sessions.get(old.id);
    expect(onB).toMatchObject({ reflection: "Only for me", reflectionShared: false });
    expect((await getLocalDb().challenges.get(snap.challenge.id))?.myParticipantId).toBe(snap.me.participantId);
    expect((await getLocalReader())?.pass).toBe(reader!.pass);

    // A private note written on B shows up decrypted on A.
    const fromB = await repo.logReading({ challengeId: snap.challenge.id, bookId: null, amount: 5, unit: "pages", reflection: "Written on B", reflectionShared: false });
    await sync();
    use(phoneA);
    await sync();
    expect(await getLocalDb().sessions.get(fromB.id)).toMatchObject({ reflection: "Written on B", reflectionShared: false });

    // Rotating on A: B's copy of the pass goes stale but its notes still decrypt (same key).
    const rotated = await rotatePass();
    expect(rotated.pass).not.toBe(reader!.pass);
    use(phoneB);
    const bReader = await ensureReadingPass();
    expect(bReader?.pass).toBeNull();
    expect(bReader?.noteKey).toBe(rotated.noteKey);
  });
});
