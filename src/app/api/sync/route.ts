import { getDb } from "@/db/client";
import { syncPushBody } from "@/lib/validation/ops";
import { authenticateDevice } from "@/server/auth";
import { clientIp, json, readJson, route } from "@/server/http";
import { applyOps } from "@/server/push";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export const POST = route("POST /api/sync", async (req) => {
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.pushIp, clientIp(req));
  await rateLimit(db, LIMITS.push, deviceId);
  const { ops } = syncPushBody.parse(await readJson(req));
  return json({ results: await applyOps(db, deviceId, ops) });
});
