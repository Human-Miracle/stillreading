import { getDb } from "@/db/client";
import { claimBody } from "@/lib/validation/reader";
import { authenticateDevice } from "@/server/auth";
import { clientIp, json, readJson, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";
import { claimPass, claimReinvite } from "@/server/readers";

export const dynamic = "force-dynamic";

/** Continue as an existing reader on this device, with a Reading Pass or a host re-invite link. */
export const POST = route("POST /api/reader/claim", async (req) => {
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.claimIp, clientIp(req));
  await rateLimit(db, LIMITS.claim, deviceId);
  const body = claimBody.parse(await readJson(req));
  return json("pass" in body ? await claimPass(db, deviceId, body.pass) : await claimReinvite(db, deviceId, body.reinvite));
});
