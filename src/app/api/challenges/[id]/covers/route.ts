import { z } from "zod";
import { getDb } from "@/db/client";
import { ID_PATTERN } from "@/lib/ids";
import { authenticateDevice, findMembership, membershipFailure } from "@/server/auth";
import { fillMissingCovers } from "@/server/covers";
import { ApiError, json, readJson, route } from "@/server/http";
import { log } from "@/server/log";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
// Open Library can take several seconds per search.
export const maxDuration = 60;

const skipBody = z.object({ skip: z.array(z.string().regex(ID_PATTERN("bk"))).max(200).optional() }).optional();

/** Any member can ask the server to find covers for the challenge's books that don't have one. */
export const POST = route("POST /api/challenges/:id/covers", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!ID_PATTERN("ch").test(id)) throw new ApiError(404, "not_found", "Challenge not found");
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.coverFill, deviceId);
  const membership = await findMembership(db, id, deviceId);
  if (membershipFailure(membership)) throw new ApiError(404, "not_found", "Challenge not found");
  const body = skipBody.parse(req.headers.get("content-type")?.includes("json") ? await readJson(req) : undefined);
  const result = await fillMissingCovers(db, id, { skip: body?.skip });
  log.info("cover_fill", { challengeId: id, ...result });
  return json(result);
});
