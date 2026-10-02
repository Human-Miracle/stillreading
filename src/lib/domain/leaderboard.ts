import { formatAmount, isGoalDay, isLive, sumByUnit } from "./goals";
import type { ParticipantProgress } from "./progress";
import type { ParticipantStatsRow } from "./stats";
import type { DateKey, GoalLike, SessionLike } from "./types";

/**
 * Pages read are the leaderboard's source of truth: every page earns {@link PAGE_XP} XP. Books and
 * chapters vary wildly in length (a chapter can be 9 pages or 50), so pages are the only fair measure
 * of how much someone read. Everything else (minutes, chapters, goal days, reading days, the current
 * streak, finished books) is a small add-on on top. There are no placement bonuses, so leading a
 * minor stat can't lift someone past a reader who read more pages.
 */
export const PAGE_XP = 10;

export const XP_CATEGORIES = [
  { key: "pages", label: "Pages", icon: "📖", rate: PAGE_XP, per: "page read", core: true, pick: (p: ParticipantProgress) => p.totals.pages },
  { key: "minutes", label: "Minutes", icon: "⏱️", rate: 1, per: "minute logged", core: false, pick: (p: ParticipantProgress) => p.totals.minutes },
  { key: "chapters", label: "Chapters", icon: "📑", rate: 5, per: "chapter logged", core: false, pick: (p: ParticipantProgress) => p.totals.chapters },
  { key: "goalDays", label: "Goal days", icon: "🎯", rate: 25, per: "day you hit your goal", core: false, pick: (p: ParticipantProgress) => p.goalDays },
  { key: "readingDays", label: "Reading days", icon: "📅", rate: 10, per: "day you read", core: false, pick: (p: ParticipantProgress) => p.readingDays },
  { key: "streak", label: "Current streak", icon: "🔥", rate: 5, per: "day of your current streak", core: false, pick: (p: ParticipantProgress) => p.streak.current },
  { key: "books", label: "Books finished", icon: "📚", rate: 50, per: "book finished", core: false, pick: (p: ParticipantProgress) => p.booksCompleted },
] as const;

export type XpCategory = (typeof XP_CATEGORIES)[number]["key"];

export interface CategoryResult {
  key: XpCategory;
  value: number;
  /** Competition rank within the category (1, 1, 3…); null when the reader has no progress in it. */
  rank: number | null;
  /** value × rate, rounded. */
  xp: number;
}

export interface LeaderboardEntry {
  participantId: string;
  displayName: string;
  /** Overall competition rank by XP (equal XP shares a rank). */
  rank: number;
  xp: number;
  pages: number;
  /** XP from pages read. */
  pageXp: number;
  /** XP from everything else. */
  bonusXp: number;
  categories: CategoryResult[];
  /** Pages when the reader has read any, otherwise their biggest add-on: a one-line "best at" label. */
  best: CategoryResult | null;
}

/** Competition ranking (ties share a rank, the next rank is skipped) over values > 0. */
function rankValues(values: readonly number[]): (number | null)[] {
  return values.map((v) => (v > 0 ? 1 + values.filter((o) => o > v).length : null));
}

export function leaderboard(rows: readonly ParticipantStatsRow[]): LeaderboardEntry[] {
  return rankByXp(
    rows.map((r) => ({
      participantId: r.participantId,
      displayName: r.displayName,
      values: Object.fromEntries(XP_CATEGORIES.map((c) => [c.key, c.pick(r.progress)])) as Record<XpCategory, number>,
    })),
  );
}

export interface DailyReader {
  participantId: string;
  displayName: string;
  goal: GoalLike | null;
  sessions: readonly SessionLike[];
}

/**
 * One day's standings: XP earned from that day's check-ins alone (pages, minutes and chapters logged,
 * plus the goal and reading-day add-ons). Streaks and finished books belong to the whole challenge, so
 * they don't count here. Only readers who read that day are ranked.
 */
export function dailyLeaderboard(readers: readonly DailyReader[], date: DateKey): LeaderboardEntry[] {
  const rows = readers.flatMap((r) => {
    const day = r.sessions.filter((s) => s.date === date && isLive(s));
    if (!day.some((s) => s.amount > 0)) return [];
    const totals = sumByUnit(day);
    const values: Record<XpCategory, number> = {
      pages: totals.pages,
      minutes: totals.minutes,
      chapters: totals.chapters,
      goalDays: r.goal && isGoalDay(r.goal, day) ? 1 : 0,
      readingDays: 1,
      streak: 0,
      books: 0,
    };
    return [{ participantId: r.participantId, displayName: r.displayName, values }];
  });
  return rankByXp(rows);
}

/** Ranks readers by the XP their category values earn. */
function rankByXp(rows: readonly { participantId: string; displayName: string; values: Record<XpCategory, number> }[]): LeaderboardEntry[] {
  const perCategory = XP_CATEGORIES.map((c) => {
    const values = rows.map((r) => r.values[c.key]);
    return { key: c.key, rate: c.rate, values, ranks: rankValues(values) };
  });

  const entries = rows.map((r, i): LeaderboardEntry => {
    const categories: CategoryResult[] = perCategory.map(({ key, rate, values, ranks }) => {
      const value = values[i]!;
      return { key, value, rank: ranks[i]!, xp: Math.round(value * rate) };
    });
    const pages = categories.find((c) => c.key === "pages")!;
    const xp = categories.reduce((sum, c) => sum + c.xp, 0);
    const best = pages.value > 0 ? pages : categories.reduce<CategoryResult | null>((b, c) => (c.xp > 0 && (!b || c.xp > b.xp) ? c : b), null);
    return {
      participantId: r.participantId,
      displayName: r.displayName,
      rank: 0,
      xp,
      pages: pages.value,
      pageXp: pages.xp,
      bonusXp: xp - pages.xp,
      categories,
      best,
    };
  });
  const goalDays = new Map(rows.map((r) => [r.participantId, r.values.goalDays]));

  // On equal XP, more pages first, then more goal days.
  entries.sort(
    (a, b) =>
      b.xp - a.xp || b.pages - a.pages || goalDays.get(b.participantId)! - goalDays.get(a.participantId)! || a.displayName.localeCompare(b.displayName),
  );
  for (const e of entries) e.rank = 1 + entries.filter((o) => o.xp > e.xp).length;
  return entries;
}

export function categoryMeta(key: XpCategory) {
  return XP_CATEGORIES.find((c) => c.key === key)!;
}

export function formatCategoryValue(key: XpCategory, value: number): string {
  switch (key) {
    case "goalDays":
      return `${formatAmount(value, "days")} on goal`;
    case "streak":
      return `${value}-day streak`;
    case "readingDays":
      return `${formatAmount(value, "days")} read`;
    case "books":
      return `${formatAmount(value, "books")} finished`;
    default:
      return formatAmount(value, key);
  }
}
