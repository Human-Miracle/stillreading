import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { api, freshDb, newDevice, resetDb } from "../helpers/server";

let db: Database;
beforeAll(async () => {
  db = await freshDb();
});
beforeEach(async () => {
  await resetDb(db);
});

const blob = "v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

describe("browser → app handoff", () => {
  it("hands an opaque blob over exactly once", async () => {
    const browser = newDevice();
    const app = newDevice();
    const created = await api<{ token: string }>("POST", "/api/handoff", { device: browser, body: { blob } });
    expect(created.status).toBe(201);
    const first = await api<{ blob: string }>("POST", "/api/handoff/claim", { device: app, body: { token: created.body.token } });
    expect(first).toMatchObject({ status: 200, body: { blob } });
    const again = await api("POST", "/api/handoff/claim", { device: app, body: { token: created.body.token } });
    expect(again.status).toBe(404);
  });

  it("rejects anything that isn't a sealed blob, and unknown tokens", async () => {
    const d = newDevice();
    expect((await api("POST", "/api/handoff", { device: d, body: { blob: "MAPLE-TIDE-LANTERN-ORBIT-58" } })).status).toBe(400);
    expect((await api("POST", "/api/handoff/claim", { device: d, body: { token: "A".repeat(24) } })).status).toBe(404);
  });

  it("needs a registered device", async () => {
    expect((await api("POST", "/api/handoff", { body: { blob } })).status).toBe(401);
  });
});
