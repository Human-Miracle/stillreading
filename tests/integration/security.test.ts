import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ChallengeSnapshot, PushResult } from "@/lib/api-types";
import { todayInTimezone } from "@/lib/domain/dates";
import { newId } from "@/lib/ids";
import type { Database } from "@/db/client";
import { api, createBody, freshDb, joinBody, newDevice, nowIso, resetDb, type TestDevice } from "../helpers/server";

let db: Database;
const WRAPPED = `v1.${"a".repeat(22)}.${"b".repeat(16)}.${"c".repeat(64)}`;

beforeAll(async () => {
  db = await freshDb();
});
beforeEach(async () => {
  await resetDb(db);
});

const push = (device: TestDevice, ops: unknown[]) => api<{ results: PushResult[] }>("POST", "/api/sync", { device, body: { ops } });
const checkIn = (challengeId: string) => ({
  opId: newId("op"),
  challengeId,
  type: "session.create",
  payload: { id: newId("rs"), date: todayInTimezone("Africa/Lagos"), amount: 5, unit: "pages", createdAt: nowIso() },
});

async function setup() {
  const host = newDevice();
  const lostPhone = newDevice();
  const created = await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body: createBody() });
  const joined = await api<ChallengeSnapshot>("POST", `/api/join/${created.body.challenge.joinCode}`, { device: lostPhone, body: joinBody("Miracle") });
  return { host, lostPhone, challengeId: created.body.challenge.id, participantId: joined.body.me.participantId };
}

describe("device revocation", () => {
  it("a host re-invite cuts off the lost phone", async () => {
    const { host, lostPhone, challengeId, participantId } = await setup();
    await api("GET", "/api/reader", { device: lostPhone });
    const inv = await api<{ token: string }>("POST", `/api/challenges/${challengeId}/reinvite`, { device: host, body: { participantId } });
    const newPhone = newDevice();
    expect((await api("POST", "/api/reader/claim", { device: newPhone, body: { reinvite: inv.body.token } })).status).toBe(200);

    // The new phone is in; the lost phone can no longer read or write as Miracle.
    expect((await push(newPhone, [checkIn(challengeId)])).body.results[0]!.status).toBe("ok");
    expect((await api("GET", `/api/challenges/${challengeId}/sync`, { device: lostPhone })).status).toBe(404);
    expect((await push(lostPhone, [checkIn(challengeId)])).body.results[0]!.status).toBe("rejected");
  });

  it("a re-invite also cuts off a legacy phone that never fetched its reader", async () => {
    const { host, lostPhone, challengeId, participantId } = await setup();
    const inv = await api<{ token: string }>("POST", `/api/challenges/${challengeId}/reinvite`, { device: host, body: { participantId } });
    await api("POST", "/api/reader/claim", { device: newDevice(), body: { reinvite: inv.body.token } });
    expect((await push(lostPhone, [checkIn(challengeId)])).body.results[0]!.status).toBe("rejected");
  });

  it("making a new pass signs out every other device on the old one", async () => {
    const { lostPhone: owner, challengeId } = await setup();
    await api("PUT", "/api/reader/pass", { device: owner, body: { pass: "MAPLE-TIDE-LANTERN-ORBIT-58", wrappedKey: WRAPPED } });
    const thief = newDevice();
    expect((await api("POST", "/api/reader/claim", { device: thief, body: { pass: "MAPLE-TIDE-LANTERN-ORBIT-58" } })).status).toBe(200);
    expect((await push(thief, [checkIn(challengeId)])).body.results[0]!.status).toBe("ok");

    // Owner rotates: the thief's device is detached, the owner keeps going.
    await api("PUT", "/api/reader/pass", { device: owner, body: { pass: "RIVER-STONE-CANDLE-MOON-07", wrappedKey: WRAPPED, rotate: true } });
    expect((await push(thief, [checkIn(challengeId)])).body.results[0]!.status).toBe("rejected");
    expect((await api("GET", `/api/challenges/${challengeId}/sync`, { device: thief })).status).toBe(404);
    expect((await push(owner, [checkIn(challengeId)])).body.results[0]!.status).toBe("ok");
  });
});
