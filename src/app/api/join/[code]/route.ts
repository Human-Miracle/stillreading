import { getDb } from "@/db/client";
import { joinChallengeBody } from "@/lib/validation/api";
import { joinCode } from "@/lib/validation/fields";
import { authenticateDevice } from "@/server/auth";
import { getJoinPreview, joinChallenge } from "@/server/challenges";
import { ApiError, clientIp, json, readJson, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

async function readCode(ctx: Ctx) {
  const parsed = joinCode.safeParse((await ctx.params).code);
  if (!parsed.success) throw new ApiError(404, "invalid_invite", "This invite link isn't valid.");
  return parsed.data;
}

export const GET = route("GET /api/join/:code", async (req, ctx: Ctx) => {
  const code = await readCode(ctx);
  const db = await getDb();
  await rateLimit(db, LIMITS.preview, clientIp(req));
  const deviceId = await authenticateDevice(db, req, { optional: true });
  return json(await getJoinPreview(db, code, deviceId));
});

export const POST = route("POST /api/join/:code", async (req, ctx: Ctx) => {
  const code = await readCode(ctx);
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.joinIp, clientIp(req));
  await rateLimit(db, LIMITS.join, deviceId);
  const body = joinChallengeBody.parse(await readJson(req));
  return json(await joinChallenge(db, deviceId, code, body));
});
