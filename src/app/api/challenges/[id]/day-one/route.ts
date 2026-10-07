import { getDb } from "@/db/client";
import { ID_PATTERN } from "@/lib/ids";
import { authenticateDevice } from "@/server/auth";
import { openDayOneWindow } from "@/server/challenges";
import { ApiError, json, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Host only: opens the challenge's one-time Day One window. */
export const POST = route("POST /api/challenges/:id/day-one", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!ID_PATTERN("ch").test(id)) throw new ApiError(404, "not_found", "Challenge not found");
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.dayOne, deviceId);
  return json({ challenge: await openDayOneWindow(db, deviceId, id) });
});
