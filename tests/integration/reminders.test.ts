import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { ChallengeSnapshot } from "@/lib/api-types";
import { newId } from "@/lib/ids";
import type { Database } from "@/db/client";
import { participants } from "@/db/schema";
import { GET as cronGET } from "@/app/api/cron/reminders/route";
import { sendReadingReminders } from "@/server/reminders";
import { api, createBody, freshDb, joinBody, newDevice, nowIso, resetDb, type TestDevice } from "../helpers/server";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...args: unknown[]) => sendNotification(...args) } }));

let db: Database;
let host: TestDevice;
let friend: TestDevice;
let snap: ChallengeSnapshot;
const friendId = newId("pt");
const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, keys: { p256dh: `BKey${n}`, auth: `auth${n}` } });

// The challenge runs in UTC so "daytime" is easy to reason about.
const at = (hhmm: string, day = new Date().toISOString().slice(0, 10)) => new Date(`${day}T${hhmm}:00Z`);
const today = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  db = await freshDb();
  process.env.VAPID_PUBLIC_KEY = "BTestPublicKey";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
});
afterAll(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.CRON_SECRET;
});

beforeEach(async () => {
  await resetDb(db);
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
  host = newDevice();
  friend = newDevice();
  snap = (await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body: createBody({ timezone: "UTC" }) })).body;
  await api("POST", `/api/join/${snap.challenge.joinCode}`, { device: friend, body: { ...joinBody("David"), participantId: friendId } });
});

const settings = (device: TestDevice, body: unknown) => api<{ enabled: boolean; reminders: boolean }>("PUT", `/api/challenges/${snap.challenge.id}/notifications`, { device, body });
const checkIn = (device: TestDevice) =>
  api("POST", "/api/sync", {
    device,
    body: { ops: [{ opId: newId("op"), challengeId: snap.challenge.id, type: "session.create", payload: { id: newId("rs"), date: today(), amount: 10, unit: "pages", createdAt: nowIso() } }] },
  });
const reminded = () => sendNotification.mock.calls.map(([s, payload]) => ({ endpoint: (s as { endpoint: string }).endpoint, ...JSON.parse(payload as string) }));

describe("reading reminders", () => {
  it("nudges readers with notifications on who haven't logged today", async () => {
    await settings(host, { enabled: true, subscription: sub(1) });
    await settings(friend, { enabled: true, subscription: sub(2) });
    await checkIn(host);

    expect(await sendReadingReminders(db, at("10:00"))).toMatchObject({ due: 1, sent: 1 });
    expect(reminded()).toEqual([
      { endpoint: sub(2).endpoint, title: "Time for today's reading 📖", body: `A few pages count. Log today's reading for ${snap.challenge.name}.`, url: `/c/${snap.challenge.id}`, tag: `reminder-${snap.challenge.id}` },
    ]);
  });

  it("waits 7 hours between reminders and stays quiet at night", async () => {
    await settings(friend, { enabled: true, subscription: sub(2) });
    await sendReadingReminders(db, at("08:30"));
    await sendReadingReminders(db, at("09:30")); // too soon
    await sendReadingReminders(db, at("15:00")); // 6.5 hours: still too soon
    expect(sendNotification).toHaveBeenCalledTimes(1);
    await sendReadingReminders(db, at("15:30")); // 7 hours later
    expect(sendNotification).toHaveBeenCalledTimes(2);
    await sendReadingReminders(db, at("22:45")); // night: never
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("respects reminders being turned off, notifications being off, and removed members", async () => {
    await settings(friend, { enabled: true, subscription: sub(2) });
    expect((await settings(friend, { reminders: false })).body).toEqual({ enabled: true, reminders: false });
    expect((await api("GET", `/api/challenges/${snap.challenge.id}/notifications`, { device: friend })).body).toMatchObject({ enabled: true, reminders: false });
    await sendReadingReminders(db, at("12:00"));
    expect(sendNotification).not.toHaveBeenCalled();

    await settings(friend, { reminders: true });
    await settings(friend, { enabled: false });
    await sendReadingReminders(db, at("12:00"));
    expect(sendNotification).not.toHaveBeenCalled();

    await settings(friend, { enabled: true });
    await db.update(participants).set({ status: "removed" }).where(eq(participants.id, friendId));
    await sendReadingReminders(db, at("12:00"));
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("only while the challenge is running", async () => {
    await settings(friend, { enabled: true, subscription: sub(2) });
    const after = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    await sendReadingReminders(db, at("12:00", after));
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("the scheduler endpoint checks CRON_SECRET when one is set", async () => {
    await settings(friend, { enabled: true, subscription: sub(2) });
    process.env.CRON_SECRET = "s3cret";
    try {
      expect((await cronGET(new Request("http://x/api/cron/reminders"), {} as never)).status).toBe(401);
      expect((await cronGET(new Request("http://x/api/cron/reminders", { headers: { authorization: "Bearer wrong!" } }), {} as never)).status).toBe(401);
      const ok = await cronGET(new Request("http://x/api/cron/reminders", { headers: { authorization: "Bearer s3cret" } }), {} as never);
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ due: expect.any(Number), sent: expect.any(Number), removed: expect.any(Number) });
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});
