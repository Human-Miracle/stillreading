import { getDb } from "@/db/client";
import { handoffClaimBody } from "@/lib/validation/reader";
import { authenticateDevice } from "@/server/auth";
import { claimHandoff } from "@/server/handoff";
import { clientIp, json, readJson, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** App side of "Open in the app": collect the handoff once. */
export const POST = route("POST /api/handoff/claim", async (req) => {
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.claimIp, clientIp(req));
  await rateLimit(db, LIMITS.claim, deviceId);
  const { token } = handoffClaimBody.parse(await readJson(req));
  return json(await claimHandoff(db, token));
});
