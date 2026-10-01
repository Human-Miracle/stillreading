import { and, count, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { ChallengeSnapshot, JoinPreview } from "@/lib/api-types";
import { challengeClock, diffDays, endDateFor, participantDuration, todayInTimezone } from "@/lib/domain/dates";
import { newId, newJoinCode } from "@/lib/ids";
import type { createChallengeBody, joinChallengeBody } from "@/lib/validation/api";
import type { Database, DbOrTx } from "@/db/client";
import { challenges, participants, processedOperations, type ChallengeRow, type ParticipantRow } from "@/db/schema";
import { findMembership } from "./auth";
import { upsertBook } from "./books";
import { upsertGoal } from "./goals";
import { ApiError } from "./http";
import { log } from "./log";
import { loadSnapshot } from "./pull";

export const MAX_PARTICIPANTS = 200;

type CreateInput = z.output<typeof createChallengeBody>;
type JoinInput = z.output<typeof joinChallengeBody>;

/** Goal totals cover the days a participant can actually read: hosts from the start, others from the day they joined. */
export function goalDurationFor(
  c: Pick<ChallengeRow, "startDate" | "endDate" | "durationDays" | "timezone">,
  p: Pick<ParticipantRow, "role" | "joinedAt">,
): number {
  if (p.role === "host") return c.durationDays;
  return participantDuration(c, todayInTimezone(c.timezone, p.joinedAt));
}

/** Effective phase: archived wins, otherwise derived from dates in the challenge timezone. */
export function challengePhase(c: Pick<ChallengeRow, "status" | "startDate" | "endDate" | "durationDays" | "timezone">, now = new Date()) {
  if (c.status === "archived") return "archived" as const;
  return challengeClock(c, now).phase;
}

async function claimOperation(tx: DbOrTx, opId: string, deviceId: string, opType: string) {
  const inserted = await tx.insert(processedOperations).values({ opId, deviceId, opType }).onConflictDoNothing().returning();
  if (inserted.length) return null;
  const [existing] = await tx.select().from(processedOperations).where(eq(processedOperations.opId, opId));
  if (!existing || existing.deviceId !== deviceId) throw new ApiError(409, "op_conflict", "Operation id already used");
  return existing;
}

export async function createChallenge(db: Database, deviceId: string, input: CreateInput): Promise<ChallengeSnapshot> {
  const today = todayInTimezone(input.challenge.timezone);
  const offset = diffDays(today, input.challenge.startDate);
  if (offset < -60 || offset > 180) {
    throw new ApiError(400, "invalid_start_date", "Start date must be within the last 60 days or the next 6 months");
  }

  return db.transaction(async (tx) => {
    const prior = await claimOperation(tx, input.opId, deviceId, "challenge.create");
    if (prior) {
      const { challengeId, participantId } = prior.result as { challengeId: string; participantId: string };
      log.info("duplicate_operation", { opType: "challenge.create" });
      return loadSnapshot(tx, challengeId, participantId);
    }

    const challengeId = newId("ch");
    const endDate = endDateFor(input.challenge.startDate, input.challenge.durationDays);
    let joinCode = newJoinCode();
    for (let i = 0; i < 3; i++) {
      const [clash] = await tx.select({ id: challenges.id }).from(challenges).where(eq(challenges.publicJoinCode, joinCode));
      if (!clash) break;
      joinCode = newJoinCode();
    }

    await tx.insert(challenges).values({
      id: challengeId,
      publicJoinCode: joinCode,
      name: input.challenge.name,
      description: input.challenge.description,
      startDate: input.challenge.startDate,
      endDate,
      durationDays: input.challenge.durationDays,
      timezone: input.challenge.timezone,
      status: "active",
    });
    await tx.insert(participants).values({
      id: input.host.participantId,
      challengeId,
      deviceId,
      displayName: input.host.displayName,
      role: "host",
    });
    await tx
      .update(challenges)
      .set({ hostParticipantId: input.host.participantId })
      .where(eq(challenges.id, challengeId));

    const ctx = { challengeId, participantId: input.host.participantId, durationDays: input.challenge.durationDays };
    const goal = await upsertGoal(tx, input.goal, ctx);
    if (goal.kind === "forbidden") throw new ApiError(409, "id_conflict", "Goal id already in use");
    if (input.book) {
      const book = await upsertBook(tx, input.book, ctx);
      if (book.kind === "forbidden") throw new ApiError(409, "id_conflict", "Book id already in use");
    }

    await tx
      .update(processedOperations)
      .set({ result: { challengeId, participantId: input.host.participantId } })
      .where(eq(processedOperations.opId, input.opId));

    log.info("challenge_created", { challengeId });
    return loadSnapshot(tx, challengeId, input.host.participantId);
  });
}

async function countActive(db: DbOrTx, challengeId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(participants)
    .where(and(eq(participants.challengeId, challengeId), eq(participants.status, "active")));
  return Number(row?.value ?? 0);
}

async function findByCode(db: DbOrTx, code: string) {
  const [row] = await db.select().from(challenges).where(eq(challenges.publicJoinCode, code));
  if (!row) throw new ApiError(404, "invalid_invite", "This invite link isn't valid.");
  return row;
}

export async function getJoinPreview(db: Database, code: string, deviceId: string | null): Promise<JoinPreview> {
  const challenge = await findByCode(db, code);
  const [participantCount, host, membership] = await Promise.all([
    countActive(db, challenge.id),
    challenge.hostParticipantId
      ? db.select({ name: participants.displayName }).from(participants).where(eq(participants.id, challenge.hostParticipantId))
      : Promise.resolve([]),
    deviceId ? findMembership(db, challenge.id, deviceId) : Promise.resolve(null),
  ]);
  return {
    challenge: {
      id: challenge.id,
      name: challenge.name,
      description: challenge.description,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
      durationDays: challenge.durationDays,
      timezone: challenge.timezone,
      status: challenge.status,
    },
    hostName: host[0]?.name ?? null,
    participantCount,
    phase: challengePhase(challenge),
    membership: membership ? { participantId: membership.id, status: membership.status } : null,
  };
}

export async function joinChallenge(db: Database, deviceId: string, code: string, input: JoinInput): Promise<ChallengeSnapshot> {
  return db.transaction(async (tx) => {
    const challenge = await findByCode(tx, code);
    const phase = challengePhase(challenge);
    const existing = await findMembership(tx, challenge.id, deviceId);

    if (existing?.status === "active") {
      // Already joined from this device (e.g. retried request): return the same membership.
      return loadSnapshot(tx, challenge.id, existing.id);
    }
    if (existing?.status === "removed") {
      log.warn("membership_denied", { challengeId: challenge.id, reason: "removed" });
      throw new ApiError(403, "removed", "You no longer have access to this challenge.");
    }
    if (phase === "archived") throw new ApiError(410, "archived", "This challenge has been archived.");
    if (phase === "ended") throw new ApiError(410, "ended", "This challenge has ended.");

    if ((await countActive(tx, challenge.id)) >= MAX_PARTICIPANTS) throw new ApiError(409, "full", "This challenge is full.");

    let participantId: string;
    if (existing) {
      // Rejoining after leaving re-activates the same membership.
      participantId = existing.id;
      await tx
        .update(participants)
        .set({ status: "active", displayName: input.displayName, updatedAt: new Date(), serverUpdatedAt: sql`now()` })
        .where(eq(participants.id, existing.id));
    } else {
      const [clash] = await tx.select({ id: participants.id }).from(participants).where(eq(participants.id, input.participantId));
      if (clash) throw new ApiError(409, "id_conflict", "Participant id already in use");
      participantId = input.participantId;
      await tx.insert(participants).values({
        id: participantId,
        challengeId: challenge.id,
        deviceId,
        displayName: input.displayName,
        role: "participant",
      });
    }

    const joined = existing ?? { role: "participant" as const, joinedAt: new Date() };
    const ctx = { challengeId: challenge.id, participantId, durationDays: goalDurationFor(challenge, joined) };
    const goal = await upsertGoal(tx, input.goal, ctx);
    if (goal.kind === "forbidden") throw new ApiError(409, "id_conflict", "Goal id already in use");
    if (input.book) {
      const book = await upsertBook(tx, input.book, ctx);
      if (book.kind === "forbidden") throw new ApiError(409, "id_conflict", "Book id already in use");
    }
    log.info("challenge_joined", { challengeId: challenge.id });
    return loadSnapshot(tx, challenge.id, participantId);
  });
}
