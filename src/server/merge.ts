import { and, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { books, goals, participants, reactions, readingSessions, replies, replyLikes, type ParticipantRow } from "@/db/schema";
import { reactionId, replyLikeId } from "@/lib/ids";

const now = sql`now()`;

/**
 * Folds a member who joined twice (another browser, the Home Screen app, cleared storage) into the
 * copy being kept: their check-ins, books, replies, reactions and likes move to `into`, and `from` is
 * removed. Reactions and likes are keyed by member, so they are re-created under `into`, skipping any
 * `into` already has. `from`'s goal moves only when `into` has none.
 */
export async function mergeParticipants(tx: Tx, from: ParticipantRow, into: ParticipantRow): Promise<ParticipantRow> {
  const moved = { participantId: into.id, serverUpdatedAt: now };
  await tx.update(readingSessions).set(moved).where(eq(readingSessions.participantId, from.id));
  await tx.update(books).set(moved).where(eq(books.participantId, from.id));
  await tx.update(replies).set(moved).where(eq(replies.participantId, from.id));

  const intoGoals = await tx.select({ priority: goals.priority }).from(goals).where(eq(goals.participantId, into.id));
  for (const g of await tx.select().from(goals).where(and(eq(goals.participantId, from.id), isNull(goals.deletedAt)))) {
    if (!intoGoals.some((x) => x.priority === g.priority)) await tx.update(goals).set(moved).where(eq(goals.id, g.id));
  }

  for (const r of await tx.select().from(reactions).where(and(eq(reactions.participantId, from.id), isNull(reactions.deletedAt)))) {
    await tx
      .insert(reactions)
      .values({ ...r, id: reactionId(r.readingSessionId, into.id, r.type), participantId: into.id, serverUpdatedAt: new Date() })
      .onConflictDoNothing();
  }
  for (const l of await tx.select().from(replyLikes).where(and(eq(replyLikes.participantId, from.id), isNull(replyLikes.deletedAt)))) {
    await tx
      .insert(replyLikes)
      .values({ ...l, id: replyLikeId(l.replyId, into.id), participantId: into.id, serverUpdatedAt: new Date() })
      .onConflictDoNothing();
  }

  const [row] = await tx
    .update(participants)
    .set({ status: "removed", updatedAt: new Date(), serverUpdatedAt: now })
    .where(eq(participants.id, from.id))
    .returning();
  return row!;
}
