import { getDb } from "@/db/client";
import { createChallengeBody } from "@/lib/validation/api";
import { authenticateDevice } from "@/server/auth";
import { createChallenge } from "@/server/challenges";
import { clientIp, json, readJson, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export const POST = route("POST /api/challenges", async (req) => {
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.createChallengeIp, clientIp(req));
  await rateLimit(db, LIMITS.createChallenge, deviceId);
  const body = createChallengeBody.parse(await readJson(req));
  const snapshot = await createChallenge(db, deviceId, body);
  return json(snapshot, { status: 201 });
});
