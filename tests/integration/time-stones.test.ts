import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { ChallengeSnapshot, PushResult } from "@/lib/api-types";
import { addDays, todayInTimezone } from "@/lib/domain/dates";
import { newId } from "@/lib/ids";
import type { Database } from "@/db/client";
import { readingSessions } from "@/db/schema";
import { api, createBody, freshDb, newDevice, resetDb, type TestDevice } from "../helpers/server";

const TZ = "Africa/Lagos"; // UTC+1
let db: Database;
let host: TestDevice;
let snap: ChallengeSnapshot;
let today: string;
let yesterday: string;

beforeAll(async () => {
  db = await freshDb();
});

beforeEach(async () => {
  // 15:00 in Lagos, so "yesterday" is well past the free hours after midnight.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${todayInTimezone(TZ, new Date())}T14:00:00Z`));
  today = todayInTimezone(TZ);
  yesterday = addDays(today, -1);
  await resetDb(db);
  host = newDevice();
  snap = (await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body: createBody({ startDate: addDays(today, -20) }) })).body;
});

afterEach(() => {
  vi.useRealTimers();
});

/** Check-ins for the given days back (e.g. 10 = ten days ago), each made on its own day. */
async function readOn(daysAgo: number[]) {
  for (const n of daysAgo) {
    const date = addDays(today, -n);
    await db.insert(readingSessions).values({
      id: newId("rs"),
      challengeId: snap.challenge.id,
      participantId: snap.me.participantId,
      date,
      amount: 20,
      unit: "pages",
      createdAt: new Date(`${date}T12:00:00Z`),
      updatedAt: new Date(`${date}T12:00:00Z`),
    });
  }
}

async function logYesterday(extra: Record<string, unknown> = {}) {
  const op = {
    opId: newId("op"),
    challengeId: snap.challenge.id,
    type: "session.create",
    payload: { id: newId("rs"), date: yesterday, amount: 25, unit: "pages", createdAt: new Date().toISOString(), ...extra },
  };
  const res = await api<{ results: PushResult[] }>("POST", "/api/sync", { device: host, body: { ops: [op] } });
  return res.body.results[0]!;
}

describe("time stones on the server", () => {
  it("won't log a missed yesterday without a stone", async () => {
    await readOn([8, 7, 6, 5, 4, 3]); // 6 reading days: no stone yet
    expect(await logYesterday({ timeStone: true })).toMatchObject({ status: "rejected", code: "no_time_stone" });
  });

  it("asks the reader to agree before spending one", async () => {
    await readOn([9, 8, 7, 6, 5, 4, 3]);
    expect(await logYesterday()).toMatchObject({ status: "rejected", code: "time_stone_needed" });
  });

  it("spends a stone to log yesterday, and only one per wallet", async () => {
    await readOn([9, 8, 7, 6, 5, 4, 3]); // 7 reading days: one stone
    const used = await logYesterday({ timeStone: true });
    expect(used).toMatchObject({ status: "ok", entity: { record: { date: yesterday, timeStone: true } } });

    // More reading for the same day is free now it has a check-in.
    expect(await logYesterday()).toMatchObject({ status: "ok", entity: { record: { timeStone: false } } });

    // Deleting the stone's check-in doesn't give the stone back, but the day stays open.
    await db.update(readingSessions).set({ deletedAt: new Date() }).where(eq(readingSessions.date, yesterday));
    expect(await logYesterday({ timeStone: true })).toMatchObject({ status: "ok", entity: { record: { timeStone: false } } });
  });

  it("logging yesterday is free just after midnight", async () => {
    vi.setSystemTime(new Date(`${today}T00:30:00Z`)); // 01:30 in Lagos
    expect(await logYesterday()).toMatchObject({ status: "ok", entity: { record: { timeStone: false } } });
  });

  it("goes by when the phone logged it, so an offline check-in made after midnight still counts as free", async () => {
    // Logged at 01:30 Lagos on this device, synced at 15:00.
    expect(await logYesterday({ createdAt: `${today}T00:30:00.000Z` })).toMatchObject({ status: "ok", entity: { record: { timeStone: false } } });
  });

  it("doesn't spend a stone when today is logged or the day already has a check-in", async () => {
    await readOn([9, 8, 7, 6, 5, 4, 3, 1]);
    expect(await logYesterday({ timeStone: true })).toMatchObject({ status: "ok", entity: { record: { timeStone: false } } });
  });

  it("syncs a check-in made offline days ago for the day it was made", async () => {
    const day = addDays(today, -4);
    expect(await logYesterday({ date: day, createdAt: `${day}T18:00:00.000Z` })).toMatchObject({ status: "ok", entity: { record: { date: day, timeStone: false } } });
  });

  it("still refuses days before yesterday, stone or not", async () => {
    await readOn([9, 8, 7, 6, 5, 4, 3]);
    expect(await logYesterday({ date: addDays(today, -2), timeStone: true })).toMatchObject({ status: "rejected", code: "date_out_of_range" });
  });
});
