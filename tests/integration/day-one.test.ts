import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ChallengeDTO, ChallengeSnapshot, PushResult } from "@/lib/api-types";
import { addDays, todayInTimezone } from "@/lib/domain/dates";
import { newId } from "@/lib/ids";
import type { Database } from "@/db/client";
import { challenges } from "@/db/schema";
import { api, createBody, freshDb, joinBody, newDevice, nowIso, resetDb, type TestDevice } from "../helpers/server";

const TZ = "Africa/Lagos";
let db: Database;
let host: TestDevice;
let friend: TestDevice;
let snap: ChallengeSnapshot;
let dayOne: string;

beforeAll(async () => {
  db = await freshDb();
});

beforeEach(async () => {
  await resetDb(db);
  host = newDevice();
  friend = newDevice();
  dayOne = addDays(todayInTimezone(TZ), -11); // today is Day 12
  snap = (await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body: createBody({ startDate: dayOne }) })).body;
  await api("POST", `/api/join/${snap.challenge.joinCode}`, { device: friend, body: joinBody() });
});

const openWindow = (device: TestDevice) =>
  api<{ challenge: ChallengeDTO; error?: { code: string } }>("POST", `/api/challenges/${snap.challenge.id}/day-one`, { device });

async function logDayOne(device: TestDevice, createdAt = nowIso()) {
  const op = {
    opId: newId("op"),
    challengeId: snap.challenge.id,
    type: "session.create",
    payload: { id: newId("rs"), date: dayOne, amount: 12, unit: "pages", createdAt },
  };
  return (await api<{ results: PushResult[] }>("POST", "/api/sync", { device, body: { ops: [op] } })).body.results[0]!;
}

describe("day one window", () => {
  it("rejects Day 1 check-ins before the host opens the window", async () => {
    expect(await logDayOne(friend)).toMatchObject({ status: "rejected", code: "day_one_closed" });
  });

  it("only the host can open it", async () => {
    const res = await openWindow(friend);
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("forbidden");
  });

  it("lets every member log Day 1 while open, and syncs the window to members", async () => {
    const res = await openWindow(host);
    expect(res.status).toBe(200);
    expect(res.body.challenge.dayOneWindowOpensAt).toBeTruthy();
    expect(await logDayOne(friend)).toMatchObject({ status: "ok", entity: { kind: "session", record: { date: dayOne } } });
    expect(await logDayOne(host)).toMatchObject({ status: "ok" });

    const pull = await api<ChallengeSnapshot>("GET", `/api/challenges/${snap.challenge.id}/sync`, { device: friend });
    expect(pull.body.challenge.dayOneWindowOpensAt).toBe(res.body.challenge.dayOneWindowOpensAt);
  });

  it("can only be opened once", async () => {
    expect((await openWindow(host)).status).toBe(200);
    const again = await openWindow(host);
    expect(again.status).toBe(409);
    expect(again.body.error?.code).toBe("day_one_used");
  });

  it("closes after three minutes for good", async () => {
    await openWindow(host);
    await db
      .update(challenges)
      .set({ dayOneWindowOpensAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(challenges.id, snap.challenge.id));
    expect(await logDayOne(friend)).toMatchObject({ status: "rejected", code: "day_one_closed" });
    // A check-in made during the window that syncs later (it was queued offline) still counts.
    expect(await logDayOne(friend, new Date(Date.now() - 9 * 60_000).toISOString())).toMatchObject({ status: "ok" });
  });

  it("can't be opened on Day 1", async () => {
    await resetDb(db);
    const fresh = (await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body: createBody() })).body;
    const res = await api<{ error: { code: string } }>("POST", `/api/challenges/${fresh.challenge.id}/day-one`, { device: host });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("day_one_unavailable");
  });
});
