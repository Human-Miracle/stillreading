import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { ChallengeSnapshot } from "@/lib/api-types";
import { newId } from "@/lib/ids";
import type { Database } from "@/db/client";
import { participants, readingSessions } from "@/db/schema";
import { addDays } from "@/lib/domain/dates";
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

  it("waits 5 hours between reminders and stays quiet at night", async () => {
    await settings(friend, { enabled: true, subscription: sub(2) });
    await sendReadingReminders(db, at("08:30"));
    await sendReadingReminders(db, at("09:30")); // too soon
    await sendReadingReminders(db, at("13:00")); // 4.5 hours: still too soon
    expect(sendNotification).toHaveBeenCalledTimes(1);
    await sendReadingReminders(db, at("13:30")); // 5 hours later
    expect(sendNotification).toHaveBeenCalledTimes(2);
    await sendReadingReminders(db, at("18:30")); // another 5 hours
    expect(sendNotification).toHaveBeenCalledTimes(3);
    await sendReadingReminders(db, at("23:45")); // night: never
    expect(sendNotification).toHaveBeenCalledTimes(3);
  });

  it("records each delivery so the reader can see it in Settings, and Apple's reason when refused", async () => {
    await settings(friend, { enabled: true, subscription: { ...sub(3), endpoint: "https://web.push.apple.com/QGuQyavXutnMH" } });
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("Received unexpected response code"), { statusCode: 403, body: '{"reason":"BadJwtToken"}' }));
    await sendReadingReminders(db, at("10:00"));
    const state = await api<{ lastDelivery: { result: string; status: number; detail: string } }>("GET", `/api/challenges/${snap.challenge.id}/notifications`, { device: friend });
    expect(state.body.lastDelivery).toMatchObject({ result: "failed", status: 403, detail: '{"reason":"BadJwtToken"}' });

    await sendReadingReminders(db, at("15:00"));
    const after = await api<{ lastDelivery: { result: string } }>("GET", `/api/challenges/${snap.challenge.id}/notifications`, { device: friend });
    expect(after.body.lastDelivery).toMatchObject({ result: "sent" });
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
      expect(await ok.json()).toEqual({ due: expect.any(Number), stones: expect.any(Number), sent: expect.any(Number), removed: expect.any(Number) });
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});

describe("Time Stone reminders", () => {
  let reader: TestDevice;
  let older: ChallengeSnapshot;

  // A challenge that started 10 days ago (UTC), so a missed yesterday and a week of reading fit in it.
  beforeEach(async () => {
    reader = newDevice();
    older = (await api<ChallengeSnapshot>("POST", "/api/challenges", { device: reader, body: createBody({ timezone: "UTC", startDate: addDays(today(), -10) }) })).body;
    await api("PUT", `/api/challenges/${older.challenge.id}/notifications`, { device: reader, body: { enabled: true, subscription: sub(7) } });
  });

  /** Check-ins `daysAgo` (0 = today), each made at noon on its own day. */
  async function readOn(daysAgo: number[]) {
    for (const n of daysAgo) {
      const date = addDays(today(), -n);
      const createdAt = new Date(`${date}T${n === 0 ? "07:00" : "12:00"}:00Z`);
      await db.insert(readingSessions).values({ id: newId("rs"), challengeId: older.challenge.id, participantId: older.me.participantId, date, amount: 20, unit: "pages", createdAt, updatedAt: createdAt });
    }
  }
  const mine = () => reminded().filter((r) => r.endpoint === sub(7).endpoint);

  it("nudges a reader who missed yesterday and holds a stone, once, and opens the check-in on yesterday", async () => {
    await readOn([9, 8, 7, 6, 5, 4, 3]); // a week of reading: one stone; missed 2 days ago and yesterday
    const run = await sendReadingReminders(db, at("09:00"));
    expect(run).toMatchObject({ stones: 1 });
    expect(mine()).toEqual([
      {
        endpoint: sub(7).endpoint,
        title: "Use your Time Stone ⏳",
        body: `You missed yesterday in ${older.challenge.name}. Log it before midnight to keep your streak.`,
        url: `/c/${older.challenge.id}?log=yesterday`,
        tag: `reminder-${older.challenge.id}`,
      },
    ]);
    // Later the same day: an ordinary reminder (still nothing logged today), not the stone again.
    await sendReadingReminders(db, at("15:00"));
    expect(mine().map((r) => r.title)).toEqual(["Use your Time Stone ⏳", "Time for today's reading 📖"]);
  });

  it("still nudges when they've already read today, since yesterday is the one to save", async () => {
    await readOn([9, 8, 7, 6, 5, 4, 0]); // the 7th reading day (today) earns the stone
    await sendReadingReminders(db, at("09:00"));
    expect(mine().map((r) => r.title)).toEqual(["Use your Time Stone ⏳"]);
  });

  it("sends the ordinary reminder instead when there's no stone, or yesterday is logged", async () => {
    await readOn([6, 5, 4, 3, 2]); // five reading days: no stone
    await sendReadingReminders(db, at("09:00"));
    expect(mine().map((r) => r.title)).toEqual(["Time for today's reading 📖"]);

    sendNotification.mockClear();
    await readOn([8, 1]); // now seven days, yesterday included: nothing to bring back
    await sendReadingReminders(db, at("15:00"));
    expect(mine().map((r) => r.title)).toEqual(["Time for today's reading 📖"]);
  });

  it("not once the stone has been spent on yesterday", async () => {
    await readOn([9, 8, 7, 6, 5, 4, 3]);
    const date = addDays(today(), -1);
    const createdAt = new Date(`${today()}T07:30:00Z`);
    await db.insert(readingSessions).values({ id: newId("rs"), challengeId: older.challenge.id, participantId: older.me.participantId, date, amount: 20, unit: "pages", timeStone: true, createdAt, updatedAt: createdAt });
    await sendReadingReminders(db, at("09:00"));
    expect(mine().map((r) => r.title)).toEqual(["Time for today's reading 📖"]);
  });
});
