import { getDb } from "@/db/client";
import { ID_PATTERN } from "@/lib/ids";
import { authenticateDevice, findMembership, membershipFailure } from "@/server/auth";
import { ApiError, json, route } from "@/server/http";
import { sendTestNotification, vapidConfig } from "@/server/notifications";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Sends a test notification to my devices now and reports what the push services answered. */
export const POST = route("POST /api/challenges/:id/notifications/test", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!ID_PATTERN("ch").test(id)) throw new ApiError(404, "not_found", "Challenge not found");
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.notifications, deviceId);
  const me = await findMembership(db, id, deviceId);
  if (membershipFailure(me)) throw new ApiError(404, "not_found", "Challenge not found");
  if (!vapidConfig()) throw new ApiError(503, "push_not_configured", "Notifications aren't set up on the server yet.");
  return json({ deliveries: await sendTestNotification(db, me!, id) });
});
