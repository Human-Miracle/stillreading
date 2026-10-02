import { getDb } from "@/db/client";
import { handoffCreateBody } from "@/lib/validation/reader";
import { authenticateDevice } from "@/server/auth";
import { createHandoff } from "@/server/handoff";
import { json, readJson, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Browser side of "Open in the app": park an encrypted handoff for a few minutes. */
export const POST = route("POST /api/handoff", async (req) => {
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.handoff, deviceId);
  const { blob } = handoffCreateBody.parse(await readJson(req));
  return json(await createHandoff(db, deviceId, blob), { status: 201 });
});
