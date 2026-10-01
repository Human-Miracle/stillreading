import { getDb } from "@/db/client";
import { ID_PATTERN } from "@/lib/ids";
import { reinviteBody } from "@/lib/validation/reader";
import { authenticateDevice } from "@/server/auth";
import { ApiError, json, readJson, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";
import { createReinvite } from "@/server/readers";

export const dynamic = "force-dynamic";

export const POST = route("POST /api/challenges/:id/reinvite", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!ID_PATTERN("ch").test(id)) throw new ApiError(404, "not_found", "Challenge not found");
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.reinvite, deviceId);
  const { participantId } = reinviteBody.parse(await readJson(req));
  return json(await createReinvite(db, deviceId, id, participantId), { status: 201 });
});
