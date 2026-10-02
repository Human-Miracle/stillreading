import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ChallengeSnapshot, PushResult } from "@/lib/api-types";
import { todayInTimezone } from "@/lib/domain/dates";
import { newId, reactionId, replyLikeId } from "@/lib/ids";
import type { Database } from "@/db/client";
import { api, bookInput, createBody, freshDb, joinBody, newDevice, nowIso, resetDb, type TestDevice } from "../helpers/server";

let db: Database;
let host: TestDevice;
let temi: TestDevice;
let temiAgain: TestDevice;
let other: TestDevice;
let snap: ChallengeSnapshot;
const ids = { temi: newId("pt"), temiAgain: newId("pt"), other: newId("pt") };

beforeAll(async () => {
  db = await freshDb();
});

beforeEach(async () => {
  await resetDb(db);
  [host, temi, temiAgain, other] = [newDevice(), newDevice(), newDevice(), newDevice()];
  snap = (await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body: createBody() })).body;
  const joinAs = (device: TestDevice, participantId: string, name: string) =>
    api("POST", `/api/join/${snap.challenge.joinCode}`, { device, body: { ...joinBody(name), participantId } });
  await joinAs(temi, ids.temi, "Temi");
  await joinAs(temiAgain, ids.temiAgain, "temi"); // Same person, opened the link again in another browser.
  await joinAs(other, ids.other, "Amaka");
});

const today = () => todayInTimezone("Africa/Lagos");
const op = <P,>(type: string, payload: P) => ({ opId: newId("op"), challengeId: snap.challenge.id, type, payload });
const push = async (device: TestDevice, ...ops: unknown[]) => (await api<{ results: PushResult[] }>("POST", "/api/sync", { device, body: { ops } })).body.results;
const checkIn = (amount: number) => op("session.create", { id: newId("rs"), date: today(), amount, unit: "pages", createdAt: nowIso() });
const pull = async (device: TestDevice) => (await api<ChallengeSnapshot>("GET", `/api/challenges/${snap.challenge.id}/sync`, { device })).body;
const merge = (device: TestDevice, fromId: string, intoId: string) => push(device, op("participant.merge", { fromId, intoId }));

describe("participant.merge", () => {
  it("moves everything the duplicate logged onto the copy being kept, then removes the duplicate", async () => {
    await push(temi, checkIn(20));
    const amakaPost = checkIn(15);
    await push(other, amakaPost);
    const book = bookInput("Red Rising");
    const dupCheckIn = checkIn(30);
    const reply = { id: newId("rp"), sessionId: amakaPost.payload.id, body: "Love this", createdAt: nowIso() };
    await push(
      temiAgain,
      op("book.upsert", book),
      dupCheckIn,
      op("reply.create", reply),
      op("reaction.set", { id: reactionId(amakaPost.payload.id, ids.temiAgain, "fire"), sessionId: amakaPost.payload.id, type: "fire", active: true, updatedAt: nowIso() }),
      op("reply.like", { id: replyLikeId(reply.id, ids.temiAgain), replyId: reply.id, active: true, updatedAt: nowIso() }),
    );

    expect((await merge(host, ids.temiAgain, ids.temi))[0]).toMatchObject({ status: "ok", entity: { kind: "participant", record: { id: ids.temiAgain, status: "removed" } } });

    const after = await pull(host);
    const mine = (id: string) => after.sessions.filter((s) => s.participantId === id).map((s) => s.amount).sort();
    expect(mine(ids.temi)).toEqual([20, 30]);
    expect(mine(ids.temiAgain)).toEqual([]);
    expect(after.books.find((b) => b.id === book.id)?.participantId).toBe(ids.temi);
    expect(after.replies.find((r) => r.id === reply.id)?.participantId).toBe(ids.temi);
    expect(after.reactions.filter((r) => r.participantId === ids.temi && !r.deletedAt).map((r) => r.id)).toEqual([reactionId(amakaPost.payload.id, ids.temi, "fire")]);
    expect(after.replyLikes.filter((l) => l.participantId === ids.temi).map((l) => l.id)).toEqual([replyLikeId(reply.id, ids.temi)]);
    expect(after.participants.find((p) => p.id === ids.temiAgain)?.status).toBe("removed");

    // The kept copy owns the moved check-in now and can delete it; the duplicate device has lost access.
    const deleted = (await push(temi, op("session.delete", { id: dupCheckIn.payload.id, updatedAt: nowIso() })))[0]!;
    expect(deleted).toMatchObject({ status: "ok", entity: { record: { id: dupCheckIn.payload.id } } });
    expect((deleted.entity!.record as { deletedAt: string | null }).deletedAt).not.toBeNull();
    expect((await push(temiAgain, checkIn(5)))[0]).toMatchObject({ status: "rejected" });
  });

  it("doesn't duplicate a reaction both copies made", async () => {
    const post = checkIn(15);
    await push(other, post);
    const fire = (pid: string) => op("reaction.set", { id: reactionId(post.payload.id, pid, "fire"), sessionId: post.payload.id, type: "fire", active: true, updatedAt: nowIso() });
    await push(temi, fire(ids.temi));
    await push(temiAgain, fire(ids.temiAgain));
    await merge(host, ids.temiAgain, ids.temi);
    const live = (await pull(host)).reactions.filter((r) => !r.deletedAt && r.participantId === ids.temi);
    expect(live).toHaveLength(1);
  });

  it("only the host can merge, never the host away, and only two active members of this challenge", async () => {
    expect((await merge(other, ids.temiAgain, ids.temi))[0]).toMatchObject({ status: "rejected", code: "forbidden" });
    expect((await merge(host, snap.me.participantId, ids.temi))[0]).toMatchObject({ status: "rejected", code: "invalid" });
    expect((await merge(host, ids.temi, ids.temi))[0]).toMatchObject({ status: "rejected", code: "invalid" });
    expect((await merge(host, ids.temiAgain, newId("pt")))[0]).toMatchObject({ status: "rejected", code: "not_found" });
    // Merging into the host is allowed (the host joined again on another device).
    expect((await merge(host, ids.temiAgain, snap.me.participantId))[0]!.status).toBe("ok");
    expect((await merge(host, ids.temiAgain, ids.temi))[0]).toMatchObject({ status: "rejected", code: "not_found" }); // already removed
  });
});
