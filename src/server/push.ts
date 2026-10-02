import { and, eq, sql } from "drizzle-orm";
import type { EntityKind, PushResult } from "@/lib/api-types";
import { diffDays, isWithinChallenge, todayInTimezone } from "@/lib/domain/dates";
import { reactionId } from "@/lib/ids";
import { syncOp, type SyncOp } from "@/lib/validation/ops";
import type { Database, Tx } from "@/db/client";
import { books, challenges, participants, processedOperations, reactions, readingSessions, replies, type ChallengeRow, type ParticipantRow } from "@/db/schema";
import { findMembership, membershipFailure } from "./auth";
import { upsertBook } from "./books";
import { challengePhase, goalDurationFor } from "./challenges";
import { upsertGoal } from "./goals";
import { errorFields, log } from "./log";
import { afterResponse, notifyReply } from "./notifications";
import { bookDTO, challengeDTO, goalDTO, participantDTO, reactionDTO, replyDTO, sessionDTO } from "./serialize";

type Outcome = Omit<PushResult, "opId">;

const ok = (kind?: EntityKind, record?: unknown): Outcome => (kind ? { status: "ok", entity: { kind, record } } : { status: "ok" });
const stale = (kind: EntityKind, record: unknown): Outcome => ({ status: "stale", entity: { kind, record } });
const rejected = (code: string, message: string): Outcome => ({ status: "rejected", code, message });

/** Applies a batch of client operations in order. Each op is its own transaction and idempotent by op id. */
export async function applyOps(db: Database, deviceId: string, rawOps: unknown[]): Promise<PushResult[]> {
  const results: PushResult[] = [];
  for (const raw of rawOps) {
    const opId = (raw as { opId: string }).opId;
    const parsed = syncOp.safeParse(raw);
    if (!parsed.success) {
      log.warn("sync_op_invalid", { opId });
      results.push({ opId, status: "rejected", code: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid operation" });
      continue;
    }
    try {
      const outcome = await applyOne(db, deviceId, parsed.data);
      results.push({ opId, ...outcome });
      // Committed: tell the thread's followers. notifyReply claims each reply once, so retries are no-ops.
      if (parsed.data.type === "reply.create" && outcome.status === "ok") {
        const replyId = parsed.data.payload.id;
        afterResponse("reply_notify", async () => void (await notifyReply(db, replyId)));
      }
    } catch (err) {
      log.error("sync_op_failed", { opId, type: parsed.data.type, ...errorFields(err) });
      results.push({ opId, status: "error", code: "server_error", message: "Could not apply operation" });
    }
  }
  return results;
}

async function applyOne(db: Database, deviceId: string, op: SyncOp): Promise<Outcome> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .insert(processedOperations)
      .values({ opId: op.opId, deviceId, opType: op.type })
      .onConflictDoNothing()
      .returning();
    if (!claimed.length) {
      const [prior] = await tx.select().from(processedOperations).where(eq(processedOperations.opId, op.opId));
      if (!prior || prior.deviceId !== deviceId) return rejected("op_conflict", "Operation id already used");
      log.info("duplicate_operation", { type: op.type });
      const stored = (prior.result ?? { status: "ok" }) as Outcome;
      return stored.status === "ok" ? { ...stored, status: "duplicate" } : stored;
    }

    const outcome = await dispatch(tx, deviceId, op);
    await tx.update(processedOperations).set({ result: outcome }).where(eq(processedOperations.opId, op.opId));
    return outcome;
  });
}

async function dispatch(tx: Tx, deviceId: string, op: SyncOp): Promise<Outcome> {
  const [challenge] = await tx.select().from(challenges).where(eq(challenges.id, op.challengeId));
  if (!challenge) return rejected("not_found", "Challenge not found");
  const me = await findMembership(tx, challenge.id, deviceId);
  const failure = membershipFailure(me);
  if (failure) {
    log.warn("membership_denied", { challengeId: challenge.id, reason: failure, type: op.type });
    return rejected(failure === "not_member" ? "forbidden" : failure, "You no longer have access to this challenge.");
  }
  if (challengePhase(challenge) === "archived") return rejected("archived", "This challenge has been archived.");
  return handlers[op.type](tx, op as never, { challenge, me: me! });
}

interface Ctx {
  challenge: ChallengeRow;
  me: ParticipantRow;
}

type Handler<T extends SyncOp["type"]> = (tx: Tx, op: Extract<SyncOp, { type: T }>, ctx: Ctx) => Promise<Outcome>;

const now = sql`now()`;

const handlers: { [T in SyncOp["type"]]: Handler<T> } = {
  async "participant.update"(tx, { payload }, { me }) {
    const updatedAt = new Date(payload.updatedAt);
    if (me.updatedAt > updatedAt) return stale("participant", participantDTO(me));
    const [row] = await tx
      .update(participants)
      .set({ displayName: payload.displayName, updatedAt, serverUpdatedAt: now })
      .where(eq(participants.id, me.id))
      .returning();
    return ok("participant", participantDTO(row!));
  },

  async "participant.leave"(tx, _op, { me }) {
    if (me.role === "host") return rejected("host_cannot_leave", "Hosts can archive the challenge instead of leaving.");
    const [row] = await tx
      .update(participants)
      .set({ status: "left", updatedAt: new Date(), serverUpdatedAt: now })
      .where(eq(participants.id, me.id))
      .returning();
    return ok("participant", participantDTO(row!));
  },

  async "goal.upsert"(tx, { payload }, { challenge, me }) {
    const res = await upsertGoal(tx, payload, { challengeId: challenge.id, participantId: me.id, durationDays: goalDurationFor(challenge, me) });
    if (res.kind === "forbidden") return rejected("forbidden", "That goal belongs to someone else.");
    return res.kind === "stale" ? stale("goal", goalDTO(res.row)) : ok("goal", goalDTO(res.row));
  },

  async "book.upsert"(tx, { payload }, { challenge, me }) {
    const res = await upsertBook(tx, payload, { challengeId: challenge.id, participantId: me.id });
    if (res.kind === "forbidden") return rejected("forbidden", "That book belongs to someone else.");
    return res.kind === "stale" ? stale("book", bookDTO(res.row)) : ok("book", bookDTO(res.row));
  },

  async "book.delete"(tx, { payload }, { me }) {
    const [row] = await tx
      .update(books)
      .set({ deletedAt: new Date(payload.updatedAt), updatedAt: new Date(payload.updatedAt), serverUpdatedAt: now })
      .where(and(eq(books.id, payload.id), eq(books.participantId, me.id)))
      .returning();
    return row ? ok("book", bookDTO(row)) : ok();
  },

  async "session.create"(tx, { payload }, { challenge, me }) {
    const [existing] = await tx.select().from(readingSessions).where(eq(readingSessions.id, payload.id));
    if (existing) {
      if (existing.participantId !== me.id) return rejected("forbidden", "That reading session belongs to someone else.");
      return ok("session", sessionDTO(existing, me.id));
    }
    const today = todayInTimezone(challenge.timezone);
    if (!isWithinChallenge(challenge, payload.date) || diffDays(today, payload.date) > 1) {
      return rejected("date_out_of_range", "That date isn't part of this challenge.");
    }
    let bookId = payload.bookId ?? null;
    if (bookId) {
      const [book] = await tx.select({ participantId: books.participantId }).from(books).where(eq(books.id, bookId));
      if (!book || book.participantId !== me.id) bookId = null;
    }
    const createdAt = new Date(payload.createdAt);
    const [row] = await tx
      .insert(readingSessions)
      .values({
        id: payload.id,
        challengeId: challenge.id,
        participantId: me.id,
        bookId,
        date: payload.date,
        amount: payload.amount,
        unit: payload.unit,
        pages: payload.unit === "pages" ? null : (payload.pages ?? null),
        reflection: payload.reflection || null,
        privateReflection: payload.privateReflection ?? null,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();
    return ok("session", sessionDTO(row!, me.id));
  },

  async "session.private"(tx, { payload }, { me }) {
    const [row] = await tx
      .update(readingSessions)
      .set({ privateReflection: payload.privateReflection, serverUpdatedAt: now })
      .where(and(eq(readingSessions.id, payload.id), eq(readingSessions.participantId, me.id)))
      .returning();
    return row ? ok("session", sessionDTO(row, me.id)) : rejected("not_found", "That check-in isn't yours.");
  },

  async "session.delete"(tx, { payload }, { me }) {
    const [row] = await tx
      .update(readingSessions)
      .set({ deletedAt: new Date(payload.updatedAt), updatedAt: new Date(payload.updatedAt), serverUpdatedAt: now })
      .where(and(eq(readingSessions.id, payload.id), eq(readingSessions.participantId, me.id)))
      .returning();
    return row ? ok("session", sessionDTO(row, me.id)) : ok();
  },

  async "reply.create"(tx, { payload }, { challenge, me }) {
    const [existing] = await tx.select().from(replies).where(eq(replies.id, payload.id));
    if (existing) {
      if (existing.participantId !== me.id) return rejected("forbidden", "That reply belongs to someone else.");
      return ok("reply", replyDTO(existing));
    }
    const [session] = await tx
      .select({ challengeId: readingSessions.challengeId, deletedAt: readingSessions.deletedAt })
      .from(readingSessions)
      .where(eq(readingSessions.id, payload.sessionId));
    if (!session || session.challengeId !== challenge.id || session.deletedAt) return rejected("not_found", "That check-in no longer exists.");
    const createdAt = new Date(payload.createdAt);
    const [row] = await tx
      .insert(replies)
      .values({ id: payload.id, challengeId: challenge.id, participantId: me.id, readingSessionId: payload.sessionId, body: payload.body, createdAt, updatedAt: createdAt })
      .returning();
    return ok("reply", replyDTO(row!));
  },

  async "reply.delete"(tx, { payload }, { me }) {
    const at = new Date(payload.updatedAt);
    const [row] = await tx
      .update(replies)
      .set({ deletedAt: at, updatedAt: at, serverUpdatedAt: now })
      .where(and(eq(replies.id, payload.id), eq(replies.participantId, me.id)))
      .returning();
    return row ? ok("reply", replyDTO(row)) : ok();
  },

  async "reaction.set"(tx, { payload }, { challenge, me }) {
    if (payload.id !== reactionId(payload.sessionId, me.id, payload.type)) {
      return rejected("forbidden", "Invalid reaction id.");
    }
    const [session] = await tx
      .select({ challengeId: readingSessions.challengeId, deletedAt: readingSessions.deletedAt })
      .from(readingSessions)
      .where(eq(readingSessions.id, payload.sessionId));
    if (!session || session.challengeId !== challenge.id) return rejected("not_found", "That check-in no longer exists.");

    const updatedAt = new Date(payload.updatedAt);
    const deletedAt = payload.active ? null : updatedAt;
    const [existing] = await tx.select().from(reactions).where(eq(reactions.id, payload.id));
    if (existing) {
      if (existing.updatedAt > updatedAt) return stale("reaction", reactionDTO(existing));
      const [row] = await tx
        .update(reactions)
        .set({ deletedAt, updatedAt, serverUpdatedAt: now })
        .where(eq(reactions.id, payload.id))
        .returning();
      return ok("reaction", reactionDTO(row!));
    }
    const [row] = await tx
      .insert(reactions)
      .values({
        id: payload.id,
        challengeId: challenge.id,
        participantId: me.id,
        readingSessionId: payload.sessionId,
        type: payload.type,
        createdAt: updatedAt,
        updatedAt,
        deletedAt,
      })
      .returning();
    return ok("reaction", reactionDTO(row!));
  },

  async "challenge.update"(tx, { payload }, { challenge, me }) {
    if (me.role !== "host") return rejected("forbidden", "Only the host can edit the challenge.");
    const updatedAt = new Date(payload.updatedAt);
    if (challenge.updatedAt > updatedAt) return stale("challenge", challengeDTO(challenge));
    const [row] = await tx
      .update(challenges)
      .set({ name: payload.name, description: payload.description, updatedAt, serverUpdatedAt: now })
      .where(eq(challenges.id, challenge.id))
      .returning();
    return ok("challenge", challengeDTO(row!));
  },

  async "challenge.archive"(tx, _op, { challenge, me }) {
    if (me.role !== "host") return rejected("forbidden", "Only the host can archive the challenge.");
    const [row] = await tx
      .update(challenges)
      .set({ status: "archived", updatedAt: new Date(), serverUpdatedAt: now })
      .where(eq(challenges.id, challenge.id))
      .returning();
    log.info("challenge_archived", { challengeId: challenge.id });
    return ok("challenge", challengeDTO(row!));
  },

  async "participant.remove"(tx, { payload }, { challenge, me }) {
    if (me.role !== "host") return rejected("forbidden", "Only the host can remove participants.");
    if (payload.participantId === me.id) return rejected("invalid", "You can't remove yourself.");
    const [row] = await tx
      .update(participants)
      .set({ status: "removed", updatedAt: new Date(), serverUpdatedAt: now })
      .where(and(eq(participants.id, payload.participantId), eq(participants.challengeId, challenge.id)))
      .returning();
    if (!row) return rejected("not_found", "Participant not found.");
    log.info("participant_removed", { challengeId: challenge.id });
    return ok("participant", participantDTO(row));
  },
};
