import { addDays, diffDays, todayInTimezone } from "./dates";
import { participantProgress, type ParticipantProgress } from "./progress";
import { groupStats, type GroupStats, type ParticipantStatsRow } from "./stats";
import type { BookLike, ChallengeLike, DateKey, GoalLike, SessionLike } from "./types";

/** Everything needed to recompute a reader's progress as it stood on an earlier day. */
export interface StandingsReader {
  participantId: string;
  displayName: string;
  goal: GoalLike | null;
  sessions: readonly SessionLike[];
  books: readonly (BookLike & { completedAt?: string | null })[];
  /** Calendar date the reader joined (null for the host / founding members), as for their progress. */
  joinedDate: DateKey | null;
}

/**
 * A reader's progress as of the end of `date`: check-ins after it are ignored and books finished after
 * it count as still being read. `asToday` is the day progress treats as today (by default `date`).
 */
export function progressAsOf(challenge: ChallengeLike, r: StandingsReader, date: DateKey, asToday: DateKey = date): ParticipantProgress {
  const finishedBy = (b: StandingsReader["books"][number]) =>
    !b.completedAt || diffDays(todayInTimezone(challenge.timezone, new Date(b.completedAt)), date) >= 0;
  return participantProgress({
    challenge,
    goal: r.goal,
    sessions: r.sessions.filter((s) => s.date <= date),
    books: r.books.map((b) => (b.status === "completed" && !finishedBy(b) ? { ...b, status: "reading" as const } : b)),
    today: asToday,
    joinedDate: r.joinedDate,
  });
}

/**
 * The crew's stats for a past day, as a recap once the day was over: that day's totals and check-ins,
 * plus running totals, best streak and consistency as of its end (the day itself fully counted). Only
 * members who had joined by then are included.
 */
export function groupStatsOn(challenge: ChallengeLike, readers: readonly StandingsReader[], date: DateKey): GroupStats {
  const joined = readers.filter((r) => !r.joinedDate || r.joinedDate <= date);
  const rows: ParticipantStatsRow[] = joined.map((r) => ({
    participantId: r.participantId,
    displayName: r.displayName,
    // Treat the next day as today, so `date` is a finished day (counted for consistency even if missed).
    progress: progressAsOf(challenge, r, date, addDays(date, 1)),
  }));
  const stats = groupStats(rows);
  // The "today" figures above describe the next day; take that day's own from its day row.
  const todayTotals = { pages: 0, chapters: 0, minutes: 0 };
  let checkedInToday = 0;
  for (const { progress } of rows) {
    const day = progress.days.find((d) => d.date === date);
    if (!day) continue;
    for (const unit of ["pages", "chapters", "minutes"] as const) todayTotals[unit] += day.totals[unit];
    if (day.read) checkedInToday += 1;
  }
  return {
    ...stats,
    todayTotals,
    checkedInToday,
    participationToday: stats.participantCount ? Math.round((checkedInToday / stats.participantCount) * 100) : 0,
  };
}

/** Readers for the history helpers, from the app's member views. */
export function standingsReaders(
  members: readonly { participant: { id: string; displayName: string; role: string; joinedAt: string }; goal: GoalLike | null; sessions: readonly SessionLike[]; books: StandingsReader["books"] }[],
  joinedDateFor: (participant: { role: string; joinedAt: string }) => DateKey | null,
): StandingsReader[] {
  return members.map((m) => ({
    participantId: m.participant.id,
    displayName: m.participant.displayName,
    goal: m.goal,
    sessions: m.sessions,
    books: m.books,
    joinedDate: joinedDateFor(m.participant),
  }));
}
