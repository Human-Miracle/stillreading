import { getDb } from "@/db/client";
import { setPassBody } from "@/lib/validation/reader";
import { authenticateDevice } from "@/server/auth";
import { json, readJson, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";
import { setPass } from "@/server/readers";

export const dynamic = "force-dynamic";

export const PUT = route("PUT /api/reader/pass", async (req) => {
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.pass, deviceId);
  const body = setPassBody.parse(await readJson(req));
  return json(await setPass(db, deviceId, body));
});
