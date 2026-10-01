import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { DEVICE_HEADER, SECRET_HEADER } from "@/lib/api-types";
import { ID_PATTERN } from "@/lib/ids";
import type { DbOrTx } from "@/db/client";
import { devices, participants, type ParticipantRow } from "@/db/schema";
import { ApiError } from "./http";
import { log } from "./log";

const SECRET_RE = /^[0-9A-Za-z]{32,128}$/;

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function readCredentials(req: Request): { deviceId: string; secret: string } | null {
  const deviceId = req.headers.get(DEVICE_HEADER);
  const secret = req.headers.get(SECRET_HEADER);
  if (!deviceId || !secret) return null;
  if (!ID_PATTERN("dvc").test(deviceId) || !SECRET_RE.test(secret)) return null;
  return { deviceId, secret };
}

/**
 * Authenticates the anonymous device. Unknown devices are registered on first use (TOFU): ids are
 * random, so a device id cannot be claimed before its owner uses it.
 */
export async function authenticateDevice(db: DbOrTx, req: Request, opts: { optional: true }): Promise<string | null>;
export async function authenticateDevice(db: DbOrTx, req: Request, opts?: { optional?: false }): Promise<string>;
export async function authenticateDevice(db: DbOrTx, req: Request, opts: { optional?: boolean } = {}): Promise<string | null> {
  const creds = readCredentials(req);
  if (!creds) {
    if (opts.optional) return null;
    throw new ApiError(401, "unauthenticated", "Missing device credentials");
  }
  const hash = hashSecret(creds.secret);
  await db.insert(devices).values({ id: creds.deviceId, secretHash: hash }).onConflictDoNothing();
  const [row] = await db.select().from(devices).where(eq(devices.id, creds.deviceId));
  if (!row || !timingSafeEqual(Buffer.from(row.secretHash), Buffer.from(hash))) {
    log.warn("device_auth_failed", { deviceId: creds.deviceId });
    if (opts.optional) return null;
    throw new ApiError(401, "unauthenticated", "Invalid device credentials");
  }
  await db
    .update(devices)
    .set({ lastSeenAt: sql`now()` })
    .where(and(eq(devices.id, row.id), lt(devices.lastSeenAt, sql`now() - interval '1 hour'`)));
  return row.id;
}

/** The device's membership row in a challenge (any status), or null. */
export async function findMembership(db: DbOrTx, challengeId: string, deviceId: string): Promise<ParticipantRow | null> {
  const [row] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.challengeId, challengeId), eq(participants.deviceId, deviceId)));
  return row ?? null;
}

export type MembershipFailure = "not_member" | "removed" | "left";

export function membershipFailure(row: ParticipantRow | null): MembershipFailure | null {
  if (!row) return "not_member";
  if (row.status === "removed") return "removed";
  if (row.status === "left") return "left";
  return null;
}
