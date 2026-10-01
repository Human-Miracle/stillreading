import type { ParticipantProgress } from "./progress";
import type { SessionUnit } from "./types";

export interface ParticipantStatsRow {
  participantId: string;
  displayName: string;
  progress: ParticipantProgress;
}

export interface Leader {
  participantId: string;
  displayName: string;
  value: number;
}

export interface GroupStats {
  participantCount: number;
  checkedInToday: number;
  participationToday: number;
  totals: Record<SessionUnit, number>;
  todayTotals: Record<SessionUnit, number>;
  booksCompleted: number;
  averageConsistency: number;
  longestStreak: number;
  peopleOnSevenPlusStreak: number;
  leaders: {
    currentStreak: Leader | null;
    mostConsistent: Leader | null;
    mostPages: Leader | null;
    mostMinutes: Leader | null;
    mostChapters: Leader | null;
    booksCompleted: Leader | null;
  };
}

function leader(rows: readonly ParticipantStatsRow[], pick: (p: ParticipantProgress) => number): Leader | null {
  let best: Leader | null = null;
  for (const r of rows) {
    const value = pick(r.progress);
    if (value <= 0) continue;
    if (!best || value > best.value || (value === best.value && r.displayName.localeCompare(best.displayName) < 0)) {
      best = { participantId: r.participantId, displayName: r.displayName, value };
    }
  }
  return best;
}

/**
 * Category-specific group stats. There is deliberately no universal score: pages, chapters,
 * minutes and books are never combined.
 */
export function groupStats(rows: readonly ParticipantStatsRow[]): GroupStats {
  const totals: Record<SessionUnit, number> = { pages: 0, chapters: 0, minutes: 0 };
  const todayTotals: Record<SessionUnit, number> = { pages: 0, chapters: 0, minutes: 0 };
  let checkedInToday = 0;
  let consistencySum = 0;
  let consistencyCount = 0;
  let booksCompleted = 0;
  let longestStreak = 0;
  let sevenPlus = 0;

  for (const { progress: p } of rows) {
    for (const unit of ["pages", "chapters", "minutes"] as const) {
      totals[unit] += p.totals[unit];
      todayTotals[unit] += p.today.totals[unit];
    }
    if (p.today.read) checkedInToday += 1;
    if (p.countedDays > 0) {
      consistencySum += p.consistency.raw;
      consistencyCount += 1;
    }
    booksCompleted += p.booksCompleted;
    longestStreak = Math.max(longestStreak, p.streak.longest);
    if (p.streak.current >= 7) sevenPlus += 1;
  }

  const participantCount = rows.length;
  return {
    participantCount,
    checkedInToday,
    participationToday: participantCount ? Math.round((checkedInToday / participantCount) * 100) : 0,
    totals,
    todayTotals,
    booksCompleted,
    averageConsistency: consistencyCount ? Math.round(consistencySum / consistencyCount) : 0,
    longestStreak,
    peopleOnSevenPlusStreak: sevenPlus,
    leaders: {
      currentStreak: leader(rows, (p) => p.streak.current),
      mostConsistent: leader(rows, (p) => (p.countedDays > 0 ? p.consistency.display : 0)),
      mostPages: leader(rows, (p) => p.totals.pages),
      mostMinutes: leader(rows, (p) => p.totals.minutes),
      mostChapters: leader(rows, (p) => p.totals.chapters),
      booksCompleted: leader(rows, (p) => p.booksCompleted),
    },
  };
}
