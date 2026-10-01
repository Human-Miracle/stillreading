import { getDb } from "@/db/client";
import { ID_PATTERN } from "@/lib/ids";
import { authenticateDevice, findMembership, membershipFailure } from "@/server/auth";
import { ApiError, json, route } from "@/server/http";
import { log } from "@/server/log";
import { loadSnapshot } from "@/server/pull";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export const GET = route("GET /api/challenges/:id/sync", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!ID_PATTERN("ch").test(id)) throw new ApiError(404, "not_found", "Challenge not found");
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.pull, deviceId);

  const membership = await findMembership(db, id, deviceId);
  const failure = membershipFailure(membership);
  if (failure === "not_member") throw new ApiError(404, "not_found", "Challenge not found");
  if (failure) {
    log.warn("membership_denied", { challengeId: id, reason: failure });
    throw new ApiError(403, failure, "You no longer have access to this challenge.");
  }

  const sinceParam = new URL(req.url).searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;
  if (since && Number.isNaN(since.getTime())) throw new ApiError(400, "invalid", "Invalid cursor");
  return json(await loadSnapshot(db, id, membership!.id, since));
});
