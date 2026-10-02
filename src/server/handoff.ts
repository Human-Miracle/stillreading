import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { Database } from "@/db/client";
import { handoffs } from "@/db/schema";
import { ApiError } from "./http";
import { log } from "./log";

export const HANDOFF_TTL_MS = 15 * 60 * 1000;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Stores an opaque, client-encrypted blob behind a one-time token. */
export async function createHandoff(db: Database, deviceId: string, blob: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
  // Housekeeping: old handoffs are useless once expired.
  await db.delete(handoffs).where(lt(handoffs.expiresAt, new Date(Date.now() - 86_400_000)));
  await db.insert(handoffs).values({ tokenHash: hashToken(token), blob, createdBy: deviceId, expiresAt });
  log.info("handoff_created", {});
  return { token, expiresAt: expiresAt.toISOString() };
}

/** Hands the blob over once, then wipes it. */
export async function claimHandoff(db: Database, token: string): Promise<{ blob: string }> {
  const hash = hashToken(token);
  const valid = and(eq(handoffs.tokenHash, hash), isNull(handoffs.usedAt), gt(handoffs.expiresAt, new Date()));
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ blob: handoffs.blob }).from(handoffs).where(valid);
    // The conditional update is the single-use gate if two devices race for the same link.
    const won = row ? await tx.update(handoffs).set({ usedAt: new Date(), blob: "" }).where(valid).returning({ tokenHash: handoffs.tokenHash }) : [];
    if (!row || !won.length) throw new ApiError(404, "invalid_handoff", "This link has expired or was already used. Copy a new one from your browser.");
    log.info("handoff_claimed", {});
    return { blob: row.blob };
  });
}
