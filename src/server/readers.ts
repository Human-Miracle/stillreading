import { createHash, randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { isValidPass, normalizePass } from "@/lib/pass";
import type { Database, DbOrTx } from "@/db/client";
import {
  books,
  challenges,
  devices,
  goals,
  participants,
  reactions,
  readers,
  readingSessions,
  reinvites,
  type ParticipantRow,
  type ReaderRow,
} from "@/db/schema";
import { findMembership } from "./auth";
import { ApiError } from "./http";
import { log } from "./log";

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

/**
 * Deterministic, deliberately slow lookup key for a pass. A fixed salt lets us find the reader by
 * pass; scrypt makes brute-forcing a leaked table impractical. The pass itself is never stored.
 */
export async function passLookup(pass: string): Promise<string> {
  const key = await scrypt(normalizePass(pass), "stillreading/reading-pass/v1", 32, { N: 16384, r: 8, p: 1 });
  return key.toString("hex");
}

export interface ReaderStatus {
  readerId: string;
  hasPass: boolean;
  passSetAt: string | null;
  wrappedKey: string | null;
}

export function readerStatus(r: ReaderRow): ReaderStatus {
  return { readerId: r.id, hasPass: Boolean(r.passLookup), passSetAt: r.passSetAt?.toISOString() ?? null, wrappedKey: r.wrappedKey };
}

/**
 * The reader behind a device, created on first use. Readers that existed before the Reading Pass
 * (one device each) are adopted here: their memberships are attached to the new reader.
 */
export async function ensureReader(db: DbOrTx, deviceId: string): Promise<ReaderRow> {
  const [device] = await db.select({ readerId: devices.readerId }).from(devices).where(eq(devices.id, deviceId));
  if (!device) throw new ApiError(401, "unauthenticated", "Unknown device");
  if (device.readerId) {
    const [r] = await db.select().from(readers).where(eq(readers.id, device.readerId));
    if (r) return r;
  }
  const [created] = await db.insert(readers).values({ id: newId("rd") }).returning();
  const claimed = await db
    .update(devices)
    .set({ readerId: created!.id })
    .where(and(eq(devices.id, deviceId), isNull(devices.readerId)))
    .returning({ id: devices.id });
  if (!claimed.length) {
    // Another request adopted this device first.
    await db.delete(readers).where(eq(readers.id, created!.id));
    return ensureReader(db, deviceId);
  }
  await db
    .update(participants)
    .set({ readerId: created!.id })
    .where(and(eq(participants.deviceId, deviceId), isNull(participants.readerId)));
  return created!;
}

export async function getReaderStatus(db: Database, deviceId: string): Promise<ReaderStatus> {
  return db.transaction(async (tx) => readerStatus(await ensureReader(tx, deviceId)));
}

/** Saves a pass (first time) or replaces it (rotate). The client generates the pass and wraps its note key. */
export async function setPass(db: Database, deviceId: string, input: { pass: string; wrappedKey: string; rotate: boolean }): Promise<ReaderStatus> {
  const pass = normalizePass(input.pass);
  if (!isValidPass(pass)) throw new ApiError(400, "invalid_pass", "That doesn't look like a Reading Pass.");
  const lookup = await passLookup(pass);
  return db.transaction(async (tx) => {
    const reader = await ensureReader(tx, deviceId);
    if (reader.passLookup && !input.rotate) throw new ApiError(409, "pass_exists", "You already have a Reading Pass.");
    const [clash] = await tx.select({ id: readers.id }).from(readers).where(and(eq(readers.passLookup, lookup), ne(readers.id, reader.id)));
    if (clash) throw new ApiError(409, "collision", "Please try again.");
    const [row] = await tx
      .update(readers)
      .set({ passLookup: lookup, wrappedKey: input.wrappedKey, passSetAt: new Date(), updatedAt: new Date() })
      .where(eq(readers.id, reader.id))
      .returning();
    if (input.rotate) {
      // A new pass signs out every other device: if the old pass leaked, whoever used it loses access.
      await tx.update(devices).set({ readerId: null }).where(and(eq(devices.readerId, reader.id), ne(devices.id, deviceId)));
    }
    log.info(input.rotate ? "reading_pass_rotated" : "reading_pass_created", {});
    return readerStatus(row!);
  });
}

async function activeChallengeIds(db: DbOrTx, readerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: participants.challengeId })
    .from(participants)
    .where(and(eq(participants.readerId, readerId), eq(participants.status, "active")));
  return rows.map((r) => r.id);
}

/**
 * Folds a duplicate membership into the original (same challenge, same person on two devices):
 * check-ins, books and reactions move over; the duplicate is marked left.
 */
export async function mergeParticipant(tx: DbOrTx, from: ParticipantRow, into: ParticipantRow) {
  const now = sql`now()`;
  await tx.update(readingSessions).set({ participantId: into.id, serverUpdatedAt: now }).where(eq(readingSessions.participantId, from.id));
  await tx.update(books).set({ participantId: into.id, serverUpdatedAt: now }).where(eq(books.participantId, from.id));
  // Reactions are unique per (participant, session, type) and their id is derived from those fields.
  await tx.execute(sql`
    delete from ${reactions} r
    where r.participant_id = ${from.id}
      and exists (select 1 from ${reactions} r2 where r2.participant_id = ${into.id} and r2.reading_session_id = r.reading_session_id and r2.type = r.type)
  `);
  await tx.execute(sql`
    update ${reactions}
    set participant_id = ${into.id},
        id = 'rx_' || substring(reading_session_id from 4) || '.' || ${into.id.slice(3)} || '.' || type,
        server_updated_at = now()
    where participant_id = ${from.id}
  `);
  await tx.delete(goals).where(eq(goals.participantId, from.id));
  if (from.role === "host") {
    await tx.update(challenges).set({ hostParticipantId: into.id, serverUpdatedAt: now }).where(eq(challenges.hostParticipantId, from.id));
    await tx.update(participants).set({ role: "host" }).where(eq(participants.id, into.id));
  }
  await tx
    .update(participants)
    .set({ status: "left", readerId: null, updatedAt: new Date(), serverUpdatedAt: now })
    .where(eq(participants.id, from.id));
}

/** Moves everything belonging to reader `fromId` (devices, memberships) onto reader `intoId`. */
async function mergeReaders(tx: DbOrTx, fromId: string, intoId: string) {
  await tx.update(devices).set({ readerId: intoId }).where(eq(devices.readerId, fromId));
  const mine = await tx.select().from(participants).where(eq(participants.readerId, fromId));
  if (mine.length) {
    const theirs = await tx
      .select()
      .from(participants)
      .where(and(eq(participants.readerId, intoId), inArray(participants.challengeId, mine.map((p) => p.challengeId))));
    for (const p of mine) {
      const original = theirs.find((t) => t.challengeId === p.challengeId);
      if (original) await mergeParticipant(tx, p, original);
      else await tx.update(participants).set({ readerId: intoId, serverUpdatedAt: sql`now()` }).where(eq(participants.id, p.id));
    }
  }
  await tx.delete(readers).where(eq(readers.id, fromId));
}

export interface ClaimResult extends ReaderStatus {
  challengeIds: string[];
}

/** A new device presents a Reading Pass and becomes that reader. */
export async function claimPass(db: Database, deviceId: string, rawPass: string): Promise<ClaimResult> {
  const pass = normalizePass(rawPass);
  if (!isValidPass(pass)) throw new ApiError(404, "invalid_pass", "We couldn't find that Reading Pass. Check the words and try again.");
  const lookup = await passLookup(pass);
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(readers).where(eq(readers.passLookup, lookup));
    if (!target) {
      log.warn("reading_pass_not_found", {});
      throw new ApiError(404, "invalid_pass", "We couldn't find that Reading Pass. Check the words and try again.");
    }
    const current = await ensureReader(tx, deviceId);
    if (current.id !== target.id) await mergeReaders(tx, current.id, target.id);
    log.info("reading_pass_claimed", {});
    return { ...readerStatus(target), challengeIds: await activeChallengeIds(tx, target.id) };
  });
}

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const REINVITE_TTL_MS = 7 * 86_400_000;

/** Host-only: a one-time link that reconnects a member who lost both their phone and their pass. */
export async function createReinvite(db: Database, deviceId: string, challengeId: string, participantId: string): Promise<{ token: string; expiresAt: string }> {
  const me = await findMembership(db, challengeId, deviceId);
  if (!me || me.status !== "active" || me.role !== "host") throw new ApiError(403, "forbidden", "Only the host can re-invite members.");
  const [target] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, participantId), eq(participants.challengeId, challengeId), eq(participants.status, "active")));
  if (!target) throw new ApiError(404, "not_found", "Member not found.");
  if (target.id === me.id) throw new ApiError(400, "invalid", "You can't re-invite yourself.");
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + REINVITE_TTL_MS);
  await db.insert(reinvites).values({ tokenHash: hashToken(token), participantId: target.id, createdBy: me.id, expiresAt });
  log.info("reinvite_created", { challengeId });
  return { token, expiresAt: expiresAt.toISOString() };
}

/** A device redeems a host re-invite and takes over that one membership. */
export async function claimReinvite(db: Database, deviceId: string, token: string): Promise<ClaimResult> {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(reinvites)
      .where(and(eq(reinvites.tokenHash, hashToken(token)), isNull(reinvites.usedAt), gt(reinvites.expiresAt, new Date())));
    if (!invite) throw new ApiError(404, "invalid_reinvite", "This link has expired or was already used. Ask your host for a new one.");
    const [target] = await tx.select().from(participants).where(eq(participants.id, invite.participantId));
    if (!target || target.status !== "active") throw new ApiError(410, "invalid_reinvite", "This membership is no longer active.");
    const reader = await ensureReader(tx, deviceId);
    const dup = await findMembership(tx, target.challengeId, deviceId);
    if (dup && dup.id !== target.id) await mergeParticipant(tx, dup, target);
    await tx.update(participants).set({ readerId: reader.id, serverUpdatedAt: sql`now()` }).where(eq(participants.id, target.id));
    await tx.update(reinvites).set({ usedAt: new Date() }).where(eq(reinvites.tokenHash, invite.tokenHash));
    log.info("reinvite_claimed", { challengeId: target.challengeId });
    const [fresh] = await tx.select().from(readers).where(eq(readers.id, reader.id));
    return { ...readerStatus(fresh!), challengeIds: await activeChallengeIds(tx, reader.id) };
  });
}
