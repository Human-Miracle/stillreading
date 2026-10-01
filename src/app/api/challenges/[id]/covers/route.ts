import { getDb } from "@/db/client";
import { ID_PATTERN } from "@/lib/ids";
import { authenticateDevice, findMembership, membershipFailure } from "@/server/auth";
import { fillMissingCovers } from "@/server/covers";
import { ApiError, json, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Any member can ask the server to find covers for the challenge's books that don't have one. */
export const POST = route("POST /api/challenges/:id/covers", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!ID_PATTERN("ch").test(id)) throw new ApiError(404, "not_found", "Challenge not found");
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.coverFill, deviceId);
  const membership = await findMembership(db, id, deviceId);
  if (membershipFailure(membership)) throw new ApiError(404, "not_found", "Challenge not found");
  return json({ filled: await fillMissingCovers(db, id) });
});
