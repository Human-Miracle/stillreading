import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { ChallengeSnapshot, PushResult } from "@/lib/api-types";
import { todayInTimezone } from "@/lib/domain/dates";
import { newId } from "@/lib/ids";
import type { Database } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import { settleBackgroundTasks } from "@/server/notifications";
import { api, createBody, freshDb, joinBody, newDevice, nowIso, resetDb, type TestDevice } from "../helpers/server";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...args: unknown[]) => sendNotification(...args) } }));

let db: Database;
let host: TestDevice;
let friend: TestDevice;
let third: TestDevice;
let snap: ChallengeSnapshot;

const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, keys: { p256dh: `BKey${n}`, auth: `auth${n}` } });

beforeAll(async () => {
  db = await freshDb();
  process.env.VAPID_PUBLIC_KEY = "BTestPublicKey";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
});

afterAll(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

beforeEach(async () => {
  await resetDb(db);
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
  host = newDevice();
  friend = newDevice();
  third = newDevice();
  snap = (await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body: createBody() })).body;
  await api("POST", `/api/join/${snap.challenge.joinCode}`, { device: friend, body: joinBody("David") });
  await api("POST", `/api/join/${snap.challenge.joinCode}`, { device: third, body: joinBody("Amaka") });
});

const settings = (device: TestDevice, body: unknown) => api<{ enabled: boolean }>("PUT", `/api/challenges/${snap.challenge.id}/notifications`, { device, body });
const push = (device: TestDevice, ops: unknown[]) => api<{ results: PushResult[] }>("POST", "/api/sync", { device, body: { ops } });

function checkIn() {
  const id = newId("rs");
  return { id, op: { opId: newId("op"), challengeId: snap.challenge.id, type: "session.create", payload: { id, date: todayInTimezone("Africa/Lagos"), amount: 20, unit: "pages", createdAt: nowIso() } } };
}
function replyOp(sessionId: string, body = "Which chapter was that?") {
  return { opId: newId("op"), challengeId: snap.challenge.id, type: "reply.create", payload: { id: newId("rp"), sessionId, body, createdAt: nowIso() } };
}
const sentTo = () => sendNotification.mock.calls.map(([s, payload]) => ({ endpoint: (s as { endpoint: string }).endpoint, ...JSON.parse(payload as string) }));

describe("notification settings", () => {
  it("exposes the public key and stores this device's subscription", async () => {
    expect((await api("GET", "/api/push/config")).body).toEqual({ publicKey: "BTestPublicKey" });
    let state = await api("GET", `/api/challenges/${snap.challenge.id}/notifications`, { device: host });
    expect(state.body).toEqual({ enabled: false, thisDevice: false });

    expect((await settings(host, { enabled: true, subscription: sub(1) })).body).toEqual({ enabled: true });
    state = await api("GET", `/api/challenges/${snap.challenge.id}/notifications`, { device: host });
    expect(state.body).toEqual({ enabled: true, thisDevice: true });

    await settings(host, { enabled: false });
    state = await api("GET", `/api/challenges/${snap.challenge.id}/notifications`, { device: host });
    expect(state.body).toEqual({ enabled: false, thisDevice: true });
  });

  it("only accepts push services run by browser vendors", async () => {
    for (const endpoint of ["https://evil.example.com/push", "http://fcm.googleapis.com/fcm/send/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.com/x"]) {
      const res = await settings(host, { enabled: true, subscription: { ...sub(1), endpoint } });
      expect(res.status, endpoint).toBe(400);
    }
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
    expect((await settings(host, { enabled: true, subscription: { ...sub(1), endpoint: "https://web.push.apple.com/QGuQyavXutnMH" } })).status).toBe(200);
  });

  it("non-members can't change settings", async () => {
    expect((await settings(newDevice(), { enabled: true, subscription: sub(9) })).status).toBe(404);
  });
});

describe("reply notifications", () => {
  it("notifies the check-in's owner, not the replier", async () => {
    await settings(host, { enabled: true, subscription: sub(1) });
    await settings(friend, { enabled: true, subscription: sub(2) });
    const { id, op } = checkIn();
    await push(host, [op]);

    await push(friend, [replyOp(id, "Which chapter was that?")]);
    await settleBackgroundTasks();
    expect(sentTo()).toEqual([
      { endpoint: sub(1).endpoint, title: "David replied to your check-in", body: "Which chapter was that?", url: `/c/${snap.challenge.id}/feed/${id}`, tag: `thread-${id}` },
    ]);
  });

  it("also notifies others who replied in the thread, if they turned notifications on", async () => {
    await settings(host, { enabled: true, subscription: sub(1) });
    await settings(friend, { enabled: true, subscription: sub(2) });
    const { id, op } = checkIn();
    await push(host, [op]);
    await push(friend, [replyOp(id)]);
    await settleBackgroundTasks();
    sendNotification.mockClear();

    // Amaka (notifications off) replies: Jessica (owner) and David (co-replier) hear about it.
    await push(third, [replyOp(id, "Love this!")]);
    await settleBackgroundTasks();
    expect(sentTo().map((n) => [n.endpoint, n.title])).toEqual([
      [sub(1).endpoint, "Amaka replied to your check-in"],
      [sub(2).endpoint, "Amaka also replied"],
    ]);

    // Nobody is notified when notifications are off.
    sendNotification.mockClear();
    await settings(host, { enabled: false });
    await settings(friend, { enabled: false });
    await push(third, [replyOp(id, "Me again")]);
    await settleBackgroundTasks();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("never notifies twice for the same reply, even when the op is retried", async () => {
    await settings(host, { enabled: true, subscription: sub(1) });
    const { id, op } = checkIn();
    await push(host, [op]);
    const r = replyOp(id);
    await push(friend, [r]);
    await push(friend, [r]); // same op id (duplicate)
    await push(friend, [{ ...r, opId: newId("op") }]); // new op id, same reply
    await settleBackgroundTasks();
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("forgets push addresses the browser has dropped", async () => {
    await settings(host, { enabled: true, subscription: sub(1) });
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 }));
    const { id, op } = checkIn();
    await push(host, [op]);
    await push(friend, [replyOp(id)]);
    await settleBackgroundTasks();
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub(1).endpoint))).toHaveLength(0);
  });

  it("does nothing when push isn't configured", async () => {
    await settings(host, { enabled: true, subscription: sub(1) });
    const key = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    try {
      expect((await api("GET", "/api/push/config")).body).toEqual({ publicKey: null });
      const { id, op } = checkIn();
      await push(host, [op]);
      await push(friend, [replyOp(id)]);
      await settleBackgroundTasks();
      expect(sendNotification).not.toHaveBeenCalled();
    } finally {
      process.env.VAPID_PRIVATE_KEY = key;
    }
  });
});
