import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { devices, participants, pushSubscriptions } from "@/db/schema";
import { ID_PATTERN } from "@/lib/ids";
import { notificationSettingsBody } from "@/lib/validation/push";
import { authenticateDevice, findMembership, membershipFailure } from "@/server/auth";
import { ApiError, json, readJson, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function member(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!ID_PATTERN("ch").test(id)) throw new ApiError(404, "not_found", "Challenge not found");
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  const me = await findMembership(db, id, deviceId);
  if (membershipFailure(me)) throw new ApiError(404, "not_found", "Challenge not found");
  return { db, deviceId, me: me! };
}

/** Whether reply notifications are on for me in this challenge, and whether this device can receive them. */
export const GET = route("GET /api/challenges/:id/notifications", async (req, ctx: Ctx) => {
  const { db, deviceId, me } = await member(req, ctx);
  const devicesOfMe = me.readerId
    ? db.select({ id: devices.id }).from(devices).where(or(eq(devices.id, deviceId), eq(devices.readerId, me.readerId)))
    : db.select({ id: devices.id }).from(devices).where(eq(devices.id, deviceId));
  const ids = (await devicesOfMe).map((d) => d.id);
  const subs = ids.length ? await db.select({ deviceId: pushSubscriptions.deviceId }).from(pushSubscriptions).where(inArray(pushSubscriptions.deviceId, ids)) : [];
  return json({ enabled: me.notifyReplies, thisDevice: subs.some((s) => s.deviceId === deviceId) });
});

/** Turn reply notifications on or off for me in this challenge, saving this device's push address when given. */
export const PUT = route("PUT /api/challenges/:id/notifications", async (req, ctx: Ctx) => {
  const { db, deviceId, me } = await member(req, ctx);
  await rateLimit(db, LIMITS.notifications, deviceId);
  const body = notificationSettingsBody.parse(await readJson(req));
  if (body.enabled && body.subscription) {
    const { endpoint, keys } = body.subscription;
    await db
      .insert(pushSubscriptions)
      .values({ endpoint, deviceId, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { deviceId, p256dh: keys.p256dh, auth: keys.auth, updatedAt: new Date() } });
  }
  await db.update(participants).set({ notifyReplies: body.enabled }).where(and(eq(participants.id, me.id), eq(participants.challengeId, me.challengeId)));
  return json({ enabled: body.enabled });
});
