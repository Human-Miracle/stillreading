import { getDb } from "@/db/client";
import { authenticateDevice } from "@/server/auth";
import { clientIp, json, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";
import { getReaderStatus } from "@/server/readers";

export const dynamic = "force-dynamic";

/** The reader behind this device (created on first use; adopts pre-pass memberships). */
export const GET = route("GET /api/reader", async (req) => {
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.pullIp, clientIp(req));
  await rateLimit(db, LIMITS.pull, deviceId);
  return json(await getReaderStatus(db, deviceId));
});
