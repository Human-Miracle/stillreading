import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ChallengeSnapshot, ClaimResultDTO, PushResult, ReaderStatusDTO } from "@/lib/api-types";
import { todayInTimezone } from "@/lib/domain/dates";
import { newId } from "@/lib/ids";
import type { Database } from "@/db/client";
import { readers, readingSessions } from "@/db/schema";
import { api, createBody, freshDb, joinBody, newDevice, nowIso, resetDb, type TestDevice } from "../helpers/server";

let db: Database;
const WRAPPED = `v1.${"a".repeat(22)}.${"b".repeat(16)}.${"c".repeat(64)}`;
const PASS = "MAPLE-TIDE-LANTERN-ORBIT-58";

beforeAll(async () => {
  db = await freshDb();
});
beforeEach(async () => {
  await resetDb(db);
});

const setPass = (device: TestDevice, pass = PASS, rotate = false) => api<ReaderStatusDTO>("PUT", "/api/reader/pass", { device, body: { pass, wrappedKey: WRAPPED, rotate } });
const claim = (device: TestDevice, body: Record<string, string>) => api<ClaimResultDTO & { error?: { code: string } }>("POST", "/api/reader/claim", { device, body });
const pull = (device: TestDevice, id: string) => api<ChallengeSnapshot & { error?: { code: string } }>("GET", `/api/challenges/${id}/sync`, { device });
const push = (device: TestDevice, ops: unknown[]) => api<{ results: PushResult[] }>("POST", "/api/sync", { device, body: { ops } });

function session(challengeId: string, extra: Record<string, unknown> = {}) {
  return {
    opId: newId("op"),
    challengeId,
    type: "session.create",
    payload: { id: newId("rs"), date: todayInTimezone("Africa/Lagos"), amount: 12, unit: "pages", createdAt: nowIso(), ...extra },
  };
}

async function setup() {
  const host = newDevice();
  const miracle = newDevice();
  const created = await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body: createBody() });
  const joined = await api<ChallengeSnapshot>("POST", `/api/join/${created.body.challenge.joinCode}`, { device: miracle, body: joinBody("Miracle") });
  return { host, miracle, snap: created.body, mine: joined.body };
}

describe("Reading Pass", () => {
  it("adopts existing members into a reader and stores only a slow hash of the pass", async () => {
    const { miracle } = await setup();
    const status = await api<ReaderStatusDTO>("GET", "/api/reader", { device: miracle });
    expect(status.body).toMatchObject({ hasPass: false, wrappedKey: null });
    const set = await setPass(miracle);
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ readerId: status.body.readerId, hasPass: true, wrappedKey: WRAPPED });
    const [row] = await db.select().from(readers).where(eq(readers.id, status.body.readerId));
    expect(row!.passLookup).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("MAPLE");
    // A second set without rotate is refused.
    expect((await setPass(miracle, "OTHER-WORD-HERE-NOW-11")).status).toBe(409);
  });

  it("a new phone continues with the pass: same membership, history and goal", async () => {
    const { miracle, mine } = await setup();
    await push(miracle, [session(mine.challenge.id)]);
    await setPass(miracle);

    const phone = newDevice();
    const res = await claim(phone, { pass: "maple tide lantern orbit 58" });
    expect(res.status).toBe(200);
    expect(res.body.challengeIds).toEqual([mine.challenge.id]);
    expect(res.body.wrappedKey).toBe(WRAPPED);

    const snap = await pull(phone, mine.challenge.id);
    expect(snap.status).toBe(200);
    expect(snap.body.me.participantId).toBe(mine.me.participantId);
    expect(snap.body.sessions.filter((s) => s.participantId === mine.me.participantId)).toHaveLength(1);
    // And can keep checking in as the same person.
    const more = await push(phone, [session(mine.challenge.id)]);
    expect(more.body.results[0]!.status).toBe("ok");
    const after = await pull(miracle, mine.challenge.id);
    expect(after.body.sessions.filter((s) => s.participantId === mine.me.participantId)).toHaveLength(2);
  });

  it("merges a duplicate membership made on the new phone before using the pass", async () => {
    const { miracle, mine, snap } = await setup();
    await setPass(miracle);
    const phone = newDevice();
    const dup = await api<ChallengeSnapshot>("POST", `/api/join/${snap.challenge.joinCode}`, { device: phone, body: joinBody("Miracle") });
    const dupSession = session(snap.challenge.id);
    await push(phone, [dupSession]);
    expect(dup.body.participants.filter((p) => p.status === "active")).toHaveLength(3);

    await claim(phone, { pass: PASS });
    const after = await pull(phone, snap.challenge.id);
    expect(after.body.me.participantId).toBe(mine.me.participantId);
    expect(after.body.participants.filter((p) => p.status === "active")).toHaveLength(2);
    const [moved] = await db.select().from(readingSessions).where(eq(readingSessions.id, dupSession.payload.id));
    expect(moved!.participantId).toBe(mine.me.participantId);
  });

  it("rejects wrong passes without saying whether one exists", async () => {
    const { miracle } = await setup();
    await setPass(miracle);
    const res = await claim(newDevice(), { pass: "MAPLE-TIDE-LANTERN-ORBIT-59" });
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("invalid_pass");
    expect((await claim(newDevice(), { pass: "hello" })).status).toBe(404);
  });

  it("rotating the pass invalidates the old one", async () => {
    const { miracle } = await setup();
    await setPass(miracle);
    expect((await setPass(miracle, "RIVER-STONE-CANDLE-MOON-07", true)).status).toBe(200);
    expect((await claim(newDevice(), { pass: PASS })).status).toBe(404);
    expect((await claim(newDevice(), { pass: "RIVER-STONE-CANDLE-MOON-07" })).status).toBe(200);
  });

  it("private reflections are stored sealed and returned only to their owner", async () => {
    const { miracle, host, mine } = await setup();
    const sealed = `v1.${"i".repeat(16)}.${"x".repeat(40)}`;
    const op = session(mine.challenge.id, { privateReflection: sealed });
    expect((await push(miracle, [op])).body.results[0]!.status).toBe("ok");
    const own = await pull(miracle, mine.challenge.id);
    expect(own.body.sessions.find((s) => s.id === op.payload.id)!.privateReflection).toBe(sealed);
    const other = await pull(host, mine.challenge.id);
    expect(other.body.sessions.find((s) => s.id === op.payload.id)!.privateReflection).toBeNull();
    // Notes written before the pass existed are uploaded later with session.private.
    const late = session(mine.challenge.id);
    await push(miracle, [late]);
    const up = await push(miracle, [{ opId: newId("op"), challengeId: mine.challenge.id, type: "session.private", payload: { id: late.payload.id, privateReflection: sealed } }]);
    expect(up.body.results[0]!.status).toBe("ok");
    const hijack = await push(host, [{ opId: newId("op"), challengeId: mine.challenge.id, type: "session.private", payload: { id: late.payload.id, privateReflection: null } }]);
    expect(hijack.body.results[0]!.status).toBe("rejected");
    // Plain text is refused: only sealed notes are accepted.
    const plain = await push(miracle, [session(mine.challenge.id, { privateReflection: "my secret thoughts" })]);
    expect(plain.body.results[0]!.status).toBe("rejected");
  });

  it("host re-invite reconnects a member who lost everything, once", async () => {
    const { host, mine, snap } = await setup();
    const notHost = await api("POST", `/api/challenges/${snap.challenge.id}/reinvite`, { device: newDevice(), body: { participantId: mine.me.participantId } });
    expect(notHost.status).toBe(403);
    const inv = await api<{ token: string }>("POST", `/api/challenges/${snap.challenge.id}/reinvite`, { device: host, body: { participantId: mine.me.participantId } });
    expect(inv.status).toBe(201);

    const phone = newDevice();
    const res = await claim(phone, { reinvite: inv.body.token });
    expect(res.status).toBe(200);
    expect(res.body.challengeIds).toEqual([snap.challenge.id]);
    expect((await pull(phone, snap.challenge.id)).body.me.participantId).toBe(mine.me.participantId);
    expect((await claim(newDevice(), { reinvite: inv.body.token })).status).toBe(404);
  });
});
