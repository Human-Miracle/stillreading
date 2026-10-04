import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { books, challenges, goals, participants, reactions, readingSessions, replies } from "@/db/schema";
import { badgeInputFrom, computeBadges, type BadgeResult } from "@/lib/domain/badges";
import { todayInTimezone } from "@/lib/domain/dates";
import { bookDTO, goalDTO, participantDTO, reactionDTO, replyDTO, sessionDTO } from "./serialize";

/**
 * Every active member's badges in a challenge, worked out from the database with the same rules the
 * app uses, so a badge can be checked before it is shared.
 */
export async function challengeBadges(db: DbOrTx, challengeId: string) {
  const [challenge] = await db.select().from(challenges).where(eq(challenges.id, challengeId));
  if (!challenge) return null;
  const members = await db
    .select()
    .from(participants)
    .where(and(eq(participants.challengeId, challengeId), eq(participants.status, "active")));
  const ids = members.map((m) => m.id);
  if (!ids.length) return { challenge, members, all: new Map<string, BadgeResult[]>() };
  const [goalRows, bookRows, sessionRows, reactionRows, replyRows] = await Promise.all([
    db.select().from(goals).where(and(inArray(goals.participantId, ids), eq(goals.priority, "primary"), isNull(goals.deletedAt))),
    db.select().from(books).where(and(eq(books.challengeId, challengeId), isNull(books.deletedAt))),
    db.select().from(readingSessions).where(and(eq(readingSessions.challengeId, challengeId), isNull(readingSessions.deletedAt))),
    db.select().from(reactions).where(and(eq(reactions.challengeId, challengeId), isNull(reactions.deletedAt))),
    db.select().from(replies).where(and(eq(replies.challengeId, challengeId), isNull(replies.deletedAt))),
  ]);
  const active = new Set(ids);
  const input = badgeInputFrom({
    challenge,
    today: todayInTimezone(challenge.timezone),
    members: members.map((m) => {
      const goal = goalRows.find((g) => g.participantId === m.id);
      return {
        participant: participantDTO(m),
        goal: goal ? goalDTO(goal) : null,
        sessions: sessionRows.filter((s) => s.participantId === m.id).map((s) => sessionDTO(s)),
        books: bookRows.filter((b) => b.participantId === m.id).map(bookDTO),
      };
    }),
    reactions: reactionRows.filter((r) => active.has(r.participantId)).map(reactionDTO),
    replies: replyRows.filter((r) => active.has(r.participantId)).map(replyDTO),
  });
  return { challenge, members, all: computeBadges(input) };
}
