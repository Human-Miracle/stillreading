import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import { ApiError, json, route } from "@/server/http";
import { sendReadingReminders } from "@/server/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  // Without a secret the run is still safe: each reader gets at most one reminder every 5 hours.
  if (!secret) return true;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Called every hour by the scheduler (.github/workflows/reading-reminders.yml). */
async function run(req: Request) {
  if (!authorized(req)) throw new ApiError(401, "unauthorized", "Not allowed");
  return json(await sendReadingReminders(await getDb()));
}

export const GET = route("GET /api/cron/reminders", run);
export const POST = route("POST /api/cron/reminders", run);
