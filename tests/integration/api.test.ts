import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import type { ChallengeSnapshot, JoinPreview, PushResult } from "@/lib/api-types";
import { todayInTimezone } from "@/lib/domain/dates";
import { newId, reactionId } from "@/lib/ids";
import type { Database } from "@/db/client";
import { processedOperations, readingSessions } from "@/db/schema";
import { api, bookInput, createBody, freshDb, resetDb, joinBody, newDevice, nowIso, type TestDevice } from "../helpers/server";

let db: Database;
let host: TestDevice;
let friend: TestDevice;
let snap: ChallengeSnapshot;

beforeAll(async () => {
  db = await freshDb();
});

beforeEach(async () => {
  await resetDb(db);
  host = newDevice();
  friend = newDevice();
  const res = await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body: createBody() });
  expect(res.status).toBe(201);
  snap = res.body;
});

async function join(device: TestDevice, name = "David") {
  return api<ChallengeSnapshot>("POST", `/api/join/${snap.challenge.joinCode}`, { device, body: joinBody(name) });
}

async function push(device: TestDevice, ops: unknown[]) {
  return api<{ results: PushResult[] }>("POST", "/api/sync", { device, body: { ops } });
}

function sessionOp(challengeId: string, extra: Record<string, unknown> = {}) {
  return {
    opId: newId("op"),
    challengeId,
    type: "session.create",
    payload: { id: newId("rs"), date: todayInTimezone("Africa/Lagos"), amount: 18, unit: "pages", reflection: "So good", createdAt: nowIso(), ...extra },
  };
}

describe("create challenge", () => {
  it("creates a 30 day challenge with the host as first participant and a random join code", () => {
    expect(snap.challenge).toMatchObject({ name: "October Reading Challenge", durationDays: 30, status: "active" });
    expect(snap.challenge.id).toMatch(/^ch_/);
    expect(snap.challenge.joinCode).toMatch(/^[0-9A-Za-z]{12}$/);
    expect(snap.participants).toHaveLength(1);
    expect(snap.participants[0]).toMatchObject({ role: "host", displayName: "Jessica" });
    expect(snap.challenge.hostParticipantId).toBe(snap.me.participantId);
    expect(snap.goals[0]).toMatchObject({ targetUnit: "pages", targetValue: 20, totalTarget: 600 });
    expect(snap.books[0]).toMatchObject({ title: "Atomic Habits" });
  });

  it("is idempotent for a retried op id", async () => {
    const body = createBody();
    const a = await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body });
    const b = await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body });
    expect(b.status).toBe(201);
    expect(b.body.challenge.id).toBe(a.body.challenge.id);
  });

  it("requires device credentials and rejects a wrong secret", async () => {
    expect((await api("POST", "/api/challenges", { body: createBody() })).status).toBe(401);
    const res = await api("POST", "/api/challenges", { device: { ...host, secret: newDevice().secret }, body: createBody() });
    expect(res.status).toBe(401);
  });

  it("validates payloads", async () => {
    const body = createBody({ name: "" });
    const res = await api<{ error: { code: string } }>("POST", "/api/challenges", { device: host, body });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid");
  });
});

describe("join", () => {
  it("shows a public preview without device data", async () => {
    const res = await api<JoinPreview>("GET", `/api/join/${snap.challenge.joinCode}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hostName: "Jessica", participantCount: 1, phase: "active", membership: null });
    expect(JSON.stringify(res.body)).not.toContain(host.deviceId);
  });

  it("joins without an account and is idempotent per device", async () => {
    const a = await join(friend);
    expect(a.status).toBe(200);
    expect(a.body.participants).toHaveLength(2);
    const b = await join(friend);
    expect(b.body.me.participantId).toBe(a.body.me.participantId);
    expect(b.body.participants).toHaveLength(2);
    const preview = await api<JoinPreview>("GET", `/api/join/${snap.challenge.joinCode}`, { device: friend });
    expect(preview.body.membership).toEqual({ participantId: a.body.me.participantId, status: "active" });
  });

  it("returns 404 for an invalid invite", async () => {
    const res = await api<{ error: { code: string } }>("GET", "/api/join/doesnotexist1");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("invalid_invite");
  });

  it("never exposes device ids to other members", async () => {
    const res = await join(friend);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(host.deviceId);
    expect(text).not.toContain(friend.deviceId);
  });

  it("sizes a late joiner's goal to the days they have left", async () => {
    const started = await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body: createBody({ startDate: todayMinus(11), durationDays: 30 }) });
    const res = await api<ChallengeSnapshot>("POST", `/api/join/${started.body.challenge.joinCode}`, { device: friend, body: joinBody() });
    const goal = res.body.goals.find((g) => g.participantId === res.body.me.participantId);
    expect(goal).toMatchObject({ targetUnit: "minutes", targetValue: 30, totalTarget: 30 * 19 });
    const hostGoal = res.body.goals.find((g) => g.participantId === started.body.me.participantId);
    expect(hostGoal!.totalTarget).toBe(600);
  });

  it("blocks joining an ended challenge", async () => {
    const old = await api<ChallengeSnapshot>("POST", "/api/challenges", {
      device: host,
      body: createBody({ startDate: todayMinus(40), durationDays: 30 }),
    });
    const res = await api<{ error: { code: string } }>("POST", `/api/join/${old.body.challenge.joinCode}`, { device: friend, body: joinBody() });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("ended");
  });
});

function todayMinus(days: number) {
  const d = new Date(`${todayInTimezone("Africa/Lagos")}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

describe("sync push", () => {
  it("creates a check-in and treats a retried op id as a duplicate (no second row)", async () => {
    const op = sessionOp(snap.challenge.id);
    const first = await push(host, [op]);
    expect(first.body.results[0]).toMatchObject({ status: "ok", entity: { kind: "session" } });
    const retry = await push(host, [op]);
    expect(retry.body.results[0]!.status).toBe("duplicate");
    const [row] = await db.select({ n: count() }).from(readingSessions);
    expect(Number(row!.n)).toBe(1);
  });

  it("the same session id in a new op is also not duplicated", async () => {
    const op = sessionOp(snap.challenge.id);
    await push(host, [op]);
    await push(host, [{ ...op, opId: newId("op") }]);
    const [row] = await db.select({ n: count() }).from(readingSessions);
    expect(Number(row!.n)).toBe(1);
  });

  it("rejects invalid amounts and out-of-range dates per op without failing the batch", async () => {
    const res = await push(host, [
      sessionOp(snap.challenge.id, { amount: 0 }),
      sessionOp(snap.challenge.id, { date: "2020-01-01" }),
      sessionOp(snap.challenge.id),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.results.map((r) => r.status)).toEqual(["rejected", "rejected", "ok"]);
    expect(res.body.results[1]!.code).toBe("date_out_of_range");
  });

  it("forbids non-members and protects other participants' records", async () => {
    const op = sessionOp(snap.challenge.id);
    expect((await push(friend, [op])).body.results[0]).toMatchObject({ status: "rejected", code: "forbidden" });

    await join(friend);
    const hostBook = snap.books[0]!;
    const hijack = { opId: newId("op"), challengeId: snap.challenge.id, type: "book.upsert", payload: { ...hostBook, title: "Hacked", updatedAt: nowIso() } };
    expect((await push(friend, [hijack])).body.results[0]).toMatchObject({ status: "rejected", code: "forbidden" });

    const fresh = { ...op, opId: newId("op") };
    await push(host, [fresh]);
    const del = { opId: newId("op"), challengeId: snap.challenge.id, type: "session.delete", payload: { id: op.payload.id, updatedAt: nowIso() } };
    await push(friend, [del]);
    const [row] = await db.select().from(readingSessions).where(eq(readingSessions.id, op.payload.id));
    expect(row!.deletedAt).toBeNull();
  });

  it("only the host can rename, archive or remove", async () => {
    const joined = await join(friend);
    const rename = { opId: newId("op"), challengeId: snap.challenge.id, type: "challenge.update", payload: { name: "Mine now", description: "", updatedAt: nowIso() } };
    expect((await push(friend, [rename])).body.results[0]!.code).toBe("forbidden");
    const remove = { opId: newId("op"), challengeId: snap.challenge.id, type: "participant.remove", payload: { participantId: snap.me.participantId } };
    expect((await push(friend, [remove])).body.results[0]!.code).toBe("forbidden");

    const hostRemove = { opId: newId("op"), challengeId: snap.challenge.id, type: "participant.remove", payload: { participantId: joined.body.me.participantId } };
    expect((await push(host, [hostRemove])).body.results[0]!.status).toBe("ok");

    // Removed: cannot pull, push or rejoin.
    const pull = await api<{ error: { code: string } }>("GET", `/api/challenges/${snap.challenge.id}/sync`, { device: friend });
    expect(pull.status).toBe(403);
    expect(pull.body.error.code).toBe("removed");
    expect((await push(friend, [sessionOp(snap.challenge.id)])).body.results[0]!.code).toBe("removed");
    expect((await join(friend)).status).toBe(403);
  });

  it("applies last-write-wins and returns the newer server record as stale", async () => {
    const book = snap.books[0]!;
    const newer = { opId: newId("op"), challengeId: snap.challenge.id, type: "book.upsert", payload: { ...book, currentPage: 120, updatedAt: new Date(Date.now() + 60_000).toISOString() } };
    const older = { opId: newId("op"), challengeId: snap.challenge.id, type: "book.upsert", payload: { ...book, currentPage: 50, updatedAt: new Date(Date.now() - 60_000).toISOString() } };
    await push(host, [newer]);
    const res = await push(host, [older]);
    expect(res.body.results[0]).toMatchObject({ status: "stale", entity: { kind: "book", record: { currentPage: 120 } } });
  });

  it("reactions are unique per participant, session and type and can be toggled", async () => {
    const joined = await join(friend);
    const op = sessionOp(snap.challenge.id);
    await push(host, [op]);
    const pid = joined.body.me.participantId;
    const rx = (active: boolean, at: number) => ({
      opId: newId("op"),
      challengeId: snap.challenge.id,
      type: "reaction.set",
      payload: { id: reactionId(op.payload.id, pid, "fire"), sessionId: op.payload.id, type: "fire", active, updatedAt: new Date(at).toISOString() },
    });
    const t = Date.now();
    await push(friend, [rx(true, t), rx(true, t + 1)]);
    let pull = await api<ChallengeSnapshot>("GET", `/api/challenges/${snap.challenge.id}/sync`, { device: host });
    expect(pull.body.reactions).toHaveLength(1);
    await push(friend, [rx(false, t + 2)]);
    pull = await api<ChallengeSnapshot>("GET", `/api/challenges/${snap.challenge.id}/sync`, { device: host });
    expect(pull.body.reactions).toHaveLength(0);

    const forged = { ...rx(true, t + 3), payload: { ...rx(true, t + 3).payload, id: reactionId(op.payload.id, snap.me.participantId, "fire") } };
    expect((await push(friend, [forged])).body.results[0]!.code).toBe("forbidden");
  });

  it("goal upsert derives fields from the preset", async () => {
    const goal = snap.goals[0]!;
    const res = await push(host, [
      { opId: newId("op"), challengeId: snap.challenge.id, type: "goal.upsert", payload: { id: goal.id, priority: "primary", preset: { kind: "chapters_per_day", value: 2 }, createdAt: goal.createdAt, updatedAt: nowIso() } },
    ]);
    expect(res.body.results[0]!.entity!.record).toMatchObject({ targetUnit: "chapters", targetValue: 2, totalTarget: 60 });
  });

  it("stores processed operations for idempotency", async () => {
    const op = sessionOp(snap.challenge.id);
    await push(host, [op]);
    const [row] = await db.select().from(processedOperations).where(eq(processedOperations.opId, op.opId));
    expect(row).toMatchObject({ deviceId: host.deviceId, opType: "session.create" });
  });
});

describe("sync pull", () => {
  it("returns deltas since a cursor, including tombstones", async () => {
    const first = await api<ChallengeSnapshot>("GET", `/api/challenges/${snap.challenge.id}/sync`, { device: host });
    expect(first.body.full).toBe(true);
    const op = sessionOp(snap.challenge.id);
    await push(host, [op]);
    await push(host, [{ opId: newId("op"), challengeId: snap.challenge.id, type: "session.delete", payload: { id: op.payload.id, updatedAt: nowIso() } }]);

    const delta = await api<ChallengeSnapshot>("GET", `/api/challenges/${snap.challenge.id}/sync?since=${encodeURIComponent(first.body.cursor)}`, { device: host });
    expect(delta.body.full).toBe(false);
    expect(delta.body.sessions).toHaveLength(1);
    expect(delta.body.sessions[0]!.deletedAt).not.toBeNull();

    const full = await api<ChallengeSnapshot>("GET", `/api/challenges/${snap.challenge.id}/sync`, { device: host });
    expect(full.body.sessions).toHaveLength(0);
  });

  it("other members see shared check-ins", async () => {
    await join(friend);
    await push(host, [sessionOp(snap.challenge.id)]);
    const res = await api<ChallengeSnapshot>("GET", `/api/challenges/${snap.challenge.id}/sync`, { device: friend });
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0]).toMatchObject({ amount: 18, reflection: "So good" });
  });

  it("non-members get 404", async () => {
    expect((await api("GET", `/api/challenges/${snap.challenge.id}/sync`, { device: friend })).status).toBe(404);
  });
});

describe("books", () => {
  it("participants can add multiple books", async () => {
    const ops = ["Deep Work", "The Creative Act"].map((title) => ({ opId: newId("op"), challengeId: snap.challenge.id, type: "book.upsert", payload: bookInput(title) }));
    const res = await push(host, ops);
    expect(res.body.results.every((r) => r.status === "ok")).toBe(true);
  });

  it("edits book details and cover, keeping the cover when a client omits it", async () => {
    const book = bookInput("Atomc Habits");
    const op = (payload: Record<string, unknown>) => ({ opId: newId("op"), challengeId: snap.challenge.id, type: "book.upsert", payload });
    const later = (s: number) => new Date(Date.now() + s * 1000).toISOString();
    const cover = "https://covers.openlibrary.org/b/id/12539702-M.jpg";
    await push(host, [op(book)]);

    const edited = (await push(host, [op({ ...book, title: "Atomic Habits", totalPages: 306, coverUrl: cover, updatedAt: later(1) })])).body.results[0];
    expect(edited).toMatchObject({ status: "ok", entity: { record: { title: "Atomic Habits", totalPages: 306, coverUrl: cover } } });

    // `bookInput` has no coverUrl key, like a client from before covers existed.
    const kept = (await push(host, [op({ ...book, title: "Atomic Habits", updatedAt: later(2) })])).body.results[0];
    expect(kept).toMatchObject({ status: "ok", entity: { record: { coverUrl: cover } } });

    const cleared = (await push(host, [op({ ...book, coverUrl: null, updatedAt: later(3) })])).body.results[0];
    expect(cleared).toMatchObject({ status: "ok", entity: { record: { coverUrl: null } } });
  });

  it("rejects cover images from other hosts", async () => {
    const payload = { ...bookInput("Deep Work"), coverUrl: "https://tracker.example.com/pixel.gif" };
    const res = await push(host, [{ opId: newId("op"), challengeId: snap.challenge.id, type: "book.upsert", payload }]);
    expect(res.body.results[0]).toMatchObject({ status: "rejected" });
  });
});
