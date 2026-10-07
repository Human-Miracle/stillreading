import { json, route } from "@/server/http";
import { vapidConfig } from "@/server/notifications";

export const dynamic = "force-dynamic";

/** The public VAPID key browsers need to subscribe, or null when push isn't set up on this deployment. */
export const GET = route("GET /api/push/config", async () => {
  return json({ publicKey: vapidConfig()?.publicKey ?? null });
});
