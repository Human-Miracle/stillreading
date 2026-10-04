import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ChallengeSnapshot } from "@/lib/api-types";
import { todayInTimezone } from "@/lib/domain/dates";
import { newId } from "@/lib/ids";
import type { Database } from "@/db/client";
import { GET as cardGET } from "@/app/b/[id]/image/route";
import { api, createBody, freshDb, joinBody, newDevice, nowIso, resetDb, type TestDevice } from "../helpers/server";

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
  snap = (await api<ChallengeSnapshot>("POST", "/api/challenges", { device: host, body: createBody() })).body;
  await api("POST", `/api/join/${snap.challenge.joinCode}`, { device: friend, body: joinBody("David") });
});

type Share = { id: string; url: string; imageUrl: string; public: boolean };
const share = (device: TestDevice, body: unknown) => api<Share>("POST", `/api/challenges/${snap.challenge.id}/badges/share`, { device, body });
const checkIn = (device: TestDevice, amount = 30) =>
  api("POST", "/api/sync", {
    device,
    body: { ops: [{ opId: newId("op"), challengeId: snap.challenge.id, type: "session.create", payload: { id: newId("rs"), date: todayInTimezone("Africa/Lagos"), amount, unit: "pages", createdAt: nowIso() } }] },
  });
const card = (id: string, format = "square") => cardGET(new Request(`http://stillreading.test/b/${id}/image?format=${format}`), { params: Promise.resolve({ id }) });

describe("badge sharing", () => {
  it("only shares badges the server confirms, and keeps one share per badge", async () => {
    expect((await share(host, { badgeId: "first_page", level: 1 })).status).toBe(403);
    await checkIn(host);

    const first = await share(host, { badgeId: "first_page", level: 1 });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ public: false, url: `/b/${first.body.id}`, imageUrl: `/b/${first.body.id}/image` });

    // Sharing the link makes it public; saving again later never makes it private again.
    expect((await share(host, { badgeId: "first_page", level: 1, public: true })).body).toMatchObject({ id: first.body.id, public: true });
    expect((await share(host, { badgeId: "first_page", level: 1 })).body).toMatchObject({ id: first.body.id, public: true });

    // Not earned yet, or a level not reached.
    expect((await share(host, { badgeId: "week_warrior", level: 1 })).status).toBe(403);
    expect((await share(host, { badgeId: "page_turner", level: 2 })).status).toBe(403);
    // Someone else can't share it for me, and outsiders get nothing.
    expect((await share(friend, { badgeId: "first_page", level: 1 })).status).toBe(403);
    expect((await share(newDevice(), { badgeId: "first_page", level: 1 })).status).toBe(404);
    expect((await share(host, { badgeId: "made_up", level: 1 })).status).toBe(400);
  });

  it("draws the card as a PNG in each size", async () => {
    await checkIn(host, 120);
    const { body } = await share(host, { badgeId: "century", level: 1 });
    for (const [format, size] of [
      ["square", [1080, 1080]],
      ["story", [1080, 1920]],
      ["og", [1200, 630]],
    ] as const) {
      const res = await card(body.id, format);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      const png = Buffer.from(await res.arrayBuffer());
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(size);
    }
    expect((await card("nope-not-a-real-id")).status).toBe(404);
  });
});
