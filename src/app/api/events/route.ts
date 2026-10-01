import { getDb } from "@/db/client";
import { productEvents } from "@/db/schema";
import { productEventBody } from "@/lib/validation/api";
import { clientIp, readJson, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Anonymous product analytics: event name, challenge id and a few scalar props. No PII. */
export const POST = route("POST /api/events", async (req) => {
  const db = await getDb();
  await rateLimit(db, LIMITS.events, clientIp(req));
  const event = productEventBody.parse(await readJson(req));
  await db.insert(productEvents).values({ name: event.name, challengeId: event.challengeId ?? null, props: event.props ?? null });
  return new Response(null, { status: 204 });
});
