import { formatAmount } from "./goals";
import type { ParticipantProgress } from "./progress";
import type { ParticipantStatsRow } from "./stats";

export const XP_CATEGORIES = [
  { key: "streak", label: "Current streak", icon: "🔥", pick: (p: ParticipantProgress) => p.streak.current },
  { key: "consistency", label: "Consistency", icon: "🎯", pick: (p: ParticipantProgress) => (p.countedDays > 0 ? p.consistency.display : 0) },
  { key: "readingDays", label: "Reading days", icon: "📅", pick: (p: ParticipantProgress) => p.readingDays },
  { key: "pages", label: "Pages", icon: "📖", pick: (p: ParticipantProgress) => p.totals.pages },
  { key: "minutes", label: "Minutes", icon: "⏱️", pick: (p: ParticipantProgress) => p.totals.minutes },
  { key: "chapters", label: "Chapters", icon: "📑", pick: (p: ParticipantProgress) => p.totals.chapters },
  { key: "books", label: "Books finished", icon: "📚", pick: (p: ParticipantProgress) => p.booksCompleted },
] as const;

export type XpCategory = (typeof XP_CATEGORIES)[number]["key"];

/** XP for finishing 1st, 2nd, 3rd… in a category. Anyone further down with progress earns the floor. */
export const RANK_XP = [100, 80, 65, 50, 40, 30, 25, 20, 15] as const;
export const MIN_XP = 10;

export function xpForRank(rank: number): number {
  return RANK_XP[rank - 1] ?? MIN_XP;
}

export interface CategoryResult {
  key: XpCategory;
  value: number;
  /** Competition rank within the category (1, 1, 3…); null when the reader has no progress in it. */
  rank: number | null;
  xp: number;
}

export interface LeaderboardEntry {
  participantId: string;
  displayName: string;
  /** Overall competition rank by XP. */
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

/**
 * Ranks every reader in each stat category and turns those ranks into XP.
 * Raw amounts are only compared within a category, so pages, minutes and chapters are never added
 * together — a minutes reader and a pages reader each earn XP for leading their own category.
 */
export function leaderboard(rows: readonly ParticipantStatsRow[]): LeaderboardEntry[] {
  const perCategory = XP_CATEGORIES.map((c) => {
    const values = rows.map((r) => c.pick(r.progress));
    return { key: c.key, values, ranks: rankValues(values) };
  });

  const entries = rows.map((r, i) => {
    const categories: CategoryResult[] = perCategory.map(({ key, values, ranks }) => {
      const rank = ranks[i]!;
      return { key, value: values[i]!, rank, xp: rank === null ? 0 : xpForRank(rank) };
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

  entries.sort((a, b) => b.xp - a.xp || b.firsts - a.firsts || a.displayName.localeCompare(b.displayName));
  for (const e of entries) e.rank = 1 + entries.filter((o) => o.xp > e.xp).length;
  return entries;
}

export function categoryMeta(key: XpCategory) {
  return XP_CATEGORIES.find((c) => c.key === key)!;
}

export function formatCategoryValue(key: XpCategory, value: number): string {
  switch (key) {
    case "consistency":
      return `${value}%`;
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
