import { and, eq, gt, isNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { ChallengeSnapshot } from "@/lib/api-types";
import type { DbOrTx } from "@/db/client";
import { books, challenges, goals, participants, reactions, readingSessions, replies } from "@/db/schema";
import { bookDTO, challengeDTO, goalDTO, participantDTO, reactionDTO, replyDTO, sessionDTO } from "./serialize";
import { ApiError } from "./http";

/** Overlap re-reads recent rows so commits that land out of order are never missed. */
export const PULL_OVERLAP_MS = 30_000;

/**
 * Snapshot of a challenge for an authorized member. With `since`, only rows changed after
 * `since - overlap` (including tombstones); without it, every live row.
 */
export async function loadSnapshot(db: DbOrTx, challengeId: string, participantId: string, since?: Date | null): Promise<ChallengeSnapshot> {
  const result = (await db.execute(sql`select now() as now`)) as unknown as { rows: { now: string | Date }[] };
  const cursor = new Date(result.rows[0]!.now);
  const after = since ? new Date(since.getTime() - PULL_OVERLAP_MS) : null;

  const filter = (challengeCol: PgColumn, updatedCol: PgColumn, deletedCol?: PgColumn): SQL | undefined => {
    const base = eq(challengeCol, challengeId);
    if (after) return and(base, gt(updatedCol, after));
    return deletedCol ? and(base, isNull(deletedCol)) : base;
  };

  const [challenge] = await db.select().from(challenges).where(eq(challenges.id, challengeId));
  if (!challenge) throw new ApiError(404, "not_found", "Challenge not found");

  const [pRows, gRows, bRows, sRows, rRows, rpRows] = await Promise.all([
    // Participants are few and always sent in full so status changes are never missed.
    db.select().from(participants).where(eq(participants.challengeId, challengeId)),
    db.select().from(goals).where(filter(goals.challengeId, goals.serverUpdatedAt, goals.deletedAt)),
    db.select().from(books).where(filter(books.challengeId, books.serverUpdatedAt, books.deletedAt)),
    db.select().from(readingSessions).where(filter(readingSessions.challengeId, readingSessions.serverUpdatedAt, readingSessions.deletedAt)),
    db.select().from(reactions).where(filter(reactions.challengeId, reactions.serverUpdatedAt, reactions.deletedAt)),
    db.select().from(replies).where(filter(replies.challengeId, replies.serverUpdatedAt, replies.deletedAt)),
  ]);

  return {
    cursor: cursor.toISOString(),
    full: !after,
    me: { participantId },
    challenge: challengeDTO(challenge),
    participants: pRows.map(participantDTO),
    goals: gRows.map(goalDTO),
    books: bRows.map(bookDTO),
    sessions: sRows.map((r) => sessionDTO(r, participantId)),
    reactions: rRows.map(reactionDTO),
    replies: rpRows.map(replyDTO),
  };
}
