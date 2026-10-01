import { lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { ApiError } from "./http";
import { log } from "./log";

export interface Limit {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export const LIMITS = {
  createChallenge: { bucket: "create", limit: 30, windowSeconds: 3600 },
  createChallengeIp: { bucket: "create-ip", limit: 30, windowSeconds: 3600 },
  join: { bucket: "join", limit: 20, windowSeconds: 600 },
  joinIp: { bucket: "join-ip", limit: 60, windowSeconds: 600 },
  preview: { bucket: "preview-ip", limit: 120, windowSeconds: 60 },
  push: { bucket: "push", limit: 120, windowSeconds: 60 },
  pull: { bucket: "pull", limit: 120, windowSeconds: 60 },
  events: { bucket: "events-ip", limit: 120, windowSeconds: 60 },
  // Generous: many phones share one carrier IP (CGNAT), but a flood of fake devices still hits it.
  register: { bucket: "register-ip", limit: 120, windowSeconds: 3600 },
  pushIp: { bucket: "push-ip", limit: 600, windowSeconds: 60 },
  pullIp: { bucket: "pull-ip", limit: 600, windowSeconds: 60 },
  claim: { bucket: "claim", limit: 10, windowSeconds: 600 },
  claimIp: { bucket: "claim-ip", limit: 30, windowSeconds: 600 },
  pass: { bucket: "pass", limit: 30, windowSeconds: 3600 },
  reinvite: { bucket: "reinvite", limit: 20, windowSeconds: 3600 },
  bookSearch: { bucket: "books-ip", limit: 60, windowSeconds: 60 },
  coverFill: { bucket: "cover-fill", limit: 30, windowSeconds: 3600 },
} satisfies Record<string, Limit>;

/**
 * Fixed-window counter in Postgres: one upsert per call, shared across serverless instances.
 * Throws 429 when exceeded.
 */
export async function rateLimit(db: DbOrTx, { bucket, limit, windowSeconds }: Limit, subject: string): Promise<void> {
  // Test-only switch; never honoured on the hosting platform.
  if (process.env.STILLREADING_DISABLE_RATE_LIMIT === "1" && !process.env.VERCEL) return;
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const key = `${bucket}:${subject}`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });

  if (Math.random() < 0.01) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(Date.now() - 86_400_000)));
  }
  if ((row?.count ?? 0) > limit) {
    log.warn("rate_limited", { bucket });
    throw new ApiError(429, "rate_limited", "Too many requests. Please slow down and try again shortly.");
  }
}
