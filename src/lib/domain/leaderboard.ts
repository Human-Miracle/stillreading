import { formatAmount } from "./goals";
import type { ParticipantProgress } from "./progress";
import type { ParticipantStatsRow } from "./stats";

/**
 * XP rewards what readers actually do, so equal XP is rare.
 *
 * 1. Effort: every unit of reading earns XP. Units are put on one footing by estimated reading time
 *    (a page ≈ 1.5 min, a chapter ≈ 20 min, a minute = 1 min), so 180 pages earns far more than
 *    30 minutes.
 * 2. Habit: reading days, goal days, the current streak and finished books.
 * 3. Placement: a small bonus for 1st/2nd/3rd in each stat (ties share a place).
 */
export const XP_CATEGORIES = [
  { key: "pages", label: "Pages", icon: "📖", rate: 1.5, per: "page", pick: (p: ParticipantProgress) => p.totals.pages },
  { key: "minutes", label: "Minutes", icon: "⏱️", rate: 1, per: "minute", pick: (p: ParticipantProgress) => p.totals.minutes },
  { key: "chapters", label: "Chapters", icon: "📑", rate: 20, per: "chapter", pick: (p: ParticipantProgress) => p.totals.chapters },
  { key: "goalDays", label: "Goal days", icon: "🎯", rate: 25, per: "day you hit your goal", pick: (p: ParticipantProgress) => p.goalDays },
  { key: "readingDays", label: "Reading days", icon: "📅", rate: 10, per: "day you read", pick: (p: ParticipantProgress) => p.readingDays },
  { key: "streak", label: "Current streak", icon: "🔥", rate: 5, per: "day of your current streak", pick: (p: ParticipantProgress) => p.streak.current },
  { key: "books", label: "Books finished", icon: "📚", rate: 50, per: "book finished", pick: (p: ParticipantProgress) => p.booksCompleted },
] as const;

export type XpCategory = (typeof XP_CATEGORIES)[number]["key"];

/** Bonus for placing 1st, 2nd, 3rd in a category. */
export const PLACE_BONUS = [30, 20, 10] as const;

export function placeBonus(rank: number | null): number {
  return rank === null ? 0 : (PLACE_BONUS[rank - 1] ?? 0);
}

export interface CategoryResult {
  key: XpCategory;
  value: number;
  /** Competition rank within the category (1, 1, 3…); null when the reader has no progress in it. */
  rank: number | null;
  /** XP from the amount itself (value × rate, rounded). */
  earned: number;
  /** Placement bonus for this category. */
  bonus: number;
  /** earned + bonus */
  xp: number;
}

export interface LeaderboardEntry {
  participantId: string;
  displayName: string;
  /** Overall competition rank by XP (equal XP shares a rank). */
  rank: number;
  xp: number;
  /** Categories this reader ranks first in. */
  firsts: number;
  categories: CategoryResult[];
  /** Highest-XP category, for a one-line "best at" label. */
  best: CategoryResult | null;
}

/** Competition ranking (ties share a rank, the next rank is skipped) over values > 0. */
function rankValues(values: readonly number[]): (number | null)[] {
  return values.map((v) => (v > 0 ? 1 + values.filter((o) => o > v).length : null));
}

export function leaderboard(rows: readonly ParticipantStatsRow[]): LeaderboardEntry[] {
  const perCategory = XP_CATEGORIES.map((c) => {
    const values = rows.map((r) => c.pick(r.progress));
    return { key: c.key, rate: c.rate, values, ranks: rankValues(values) };
  });

  const entries = rows.map((r, i) => {
    const categories: CategoryResult[] = perCategory.map(({ key, rate, values, ranks }) => {
      const value = values[i]!;
      const rank = ranks[i]!;
      const earned = Math.round(value * rate);
      const bonus = placeBonus(rank);
      return { key, value, rank, earned, bonus, xp: earned + bonus };
    });
    const best = categories.reduce<CategoryResult | null>((b, c) => (c.xp > 0 && (!b || c.xp > b.xp) ? c : b), null);
    return {
      participantId: r.participantId,
      displayName: r.displayName,
      rank: 0,
      xp: categories.reduce((sum, c) => sum + c.xp, 0),
      firsts: categories.filter((c) => c.rank === 1).length,
      categories,
      best,
    };
  });
  const goalDays = new Map(rows.map((r) => [r.participantId, r.progress.goalDays]));

  // Equal XP is now rare; when it happens the reader with more goal days is listed first.
  entries.sort(
    (a, b) =>
      b.xp - a.xp ||
      goalDays.get(b.participantId)! - goalDays.get(a.participantId)! ||
      b.firsts - a.firsts ||
      a.displayName.localeCompare(b.displayName),
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
