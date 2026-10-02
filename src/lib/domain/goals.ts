import type { GoalLike, GoalUnit, SessionLike, SessionUnit } from "./types";

export type GoalPresetKind =
  | "every_day"
  | "pages_per_day"
  | "chapters_per_day"
  | "minutes_per_day"
  | "books"
  | "total_pages";

export interface GoalPreset {
  kind: GoalPresetKind;
  /** Ignored for `every_day`. */
  value: number;
}

export const PRESET_DEFAULTS: Record<GoalPresetKind, number> = {
  every_day: 1,
  pages_per_day: 20,
  chapters_per_day: 1,
  minutes_per_day: 30,
  books: 2,
  total_pages: 600,
};

export function goalFromPreset(preset: GoalPreset, durationDays: number): GoalLike {
  const value = Math.max(1, Math.round(preset.value));
  switch (preset.kind) {
    case "every_day":
      return { goalType: "daily", targetUnit: "days", targetValue: 1, frequency: "daily", totalTarget: durationDays };
    case "pages_per_day":
      return { goalType: "daily", targetUnit: "pages", targetValue: value, frequency: "daily", totalTarget: value * durationDays };
    case "chapters_per_day":
      return { goalType: "daily", targetUnit: "chapters", targetValue: value, frequency: "daily", totalTarget: value * durationDays };
    case "minutes_per_day":
      return { goalType: "daily", targetUnit: "minutes", targetValue: value, frequency: "daily", totalTarget: value * durationDays };
    case "books":
      return { goalType: "total", targetUnit: "books", targetValue: value, frequency: "challenge", totalTarget: value };
    case "total_pages":
      return { goalType: "total", targetUnit: "pages", targetValue: value, frequency: "challenge", totalTarget: value };
  }
}

export function presetFromGoal(goal: GoalLike): GoalPreset {
  if (goal.targetUnit === "days") return { kind: "every_day", value: 1 };
  if (goal.goalType === "total") {
    return goal.targetUnit === "books"
      ? { kind: "books", value: goal.totalTarget }
      : { kind: "total_pages", value: goal.totalTarget };
  }
  const kind: GoalPresetKind =
    goal.targetUnit === "chapters" ? "chapters_per_day" : goal.targetUnit === "minutes" ? "minutes_per_day" : "pages_per_day";
  return { kind, value: goal.targetValue };
}

export function unitLabel(unit: GoalUnit | SessionUnit, amount: number): string {
  const singular: Record<GoalUnit, string> = { pages: "page", chapters: "chapter", minutes: "minute", books: "book", days: "day" };
  return amount === 1 ? singular[unit] : unit;
}

export function formatAmount(amount: number, unit: GoalUnit | SessionUnit): string {
  return `${amount.toLocaleString("en-US")} ${unitLabel(unit, amount)}`;
}

/** "30 minutes · 12 pages" for a minutes / chapters check-in with pages, else just the amount. */
export function formatSession(s: Pick<SessionLike, "unit" | "amount" | "pages">): string {
  const main = formatAmount(s.amount, s.unit);
  return s.unit !== "pages" && s.pages ? `${main} · ${formatAmount(s.pages, "pages")}` : main;
}

export function describeGoal(goal: GoalLike): string {
  if (goal.targetUnit === "days") return `Read every day · ${goal.totalTarget} reading days`;
  if (goal.goalType === "daily") return `${formatAmount(goal.targetValue, goal.targetUnit)}/day`;
  return `${formatAmount(goal.totalTarget, goal.targetUnit)} this challenge`;
}

/** Unit a check-in should default to for this goal. */
export function defaultSessionUnit(goal: GoalLike | null | undefined): SessionUnit {
  if (goal && (goal.targetUnit === "pages" || goal.targetUnit === "chapters" || goal.targetUnit === "minutes")) {
    return goal.targetUnit;
  }
  return "pages";
}

/** Whether sessions in `unit` add to the goal's amount. Days/books goals are "any reading". */
export function sessionCountsTowardAmount(goal: GoalLike, unit: SessionUnit): boolean {
  return goal.targetUnit === unit;
}

/** Amount a single check-in adds toward a pages / chapters / minutes goal. */
function amountFor(goal: GoalLike, s: SessionLike): number {
  if (goal.targetUnit === "pages") return pagesRead(s);
  return sessionCountsTowardAmount(goal, s.unit) ? s.amount : 0;
}

export function isLive<T extends { deletedAt?: string | null }>(row: T): boolean {
  return !row.deletedAt;
}

/**
 * Pages a check-in covered: the amount for a pages check-in, or the pages entered alongside a
 * minutes or chapters check-in. Pages are the common measure of how much someone read.
 */
export function pagesRead(s: Pick<SessionLike, "unit" | "amount" | "pages">): number {
  return s.unit === "pages" ? s.amount : (s.pages ?? 0);
}

/** Totals per unit. `pages` includes pages covered during minutes and chapters check-ins. */
export function sumByUnit(sessions: readonly SessionLike[]): Record<SessionUnit, number> {
  const totals: Record<SessionUnit, number> = { pages: 0, chapters: 0, minutes: 0 };
  for (const s of sessions) {
    if (!isLive(s)) continue;
    if (s.unit !== "pages") totals[s.unit] += s.amount;
    totals.pages += pagesRead(s);
  }
  return totals;
}

export interface DailyTarget {
  /** null → any reading counts. */
  amount: number | null;
  unit: GoalUnit;
}

export function dailyTarget(goal: GoalLike): DailyTarget {
  if (goal.goalType === "daily" && goal.targetUnit !== "days") return { amount: goal.targetValue, unit: goal.targetUnit };
  return { amount: null, unit: goal.targetUnit };
}

/**
 * Whether a set of sessions (all from one challenge day) achieves the daily goal.
 * Daily amount goals need `sum(matching unit) >= target`. "Read every day" and total-type goals
 * count any reading as a goal day.
 */
export function isGoalDay(goal: GoalLike, daySessions: readonly SessionLike[]): boolean {
  const live = daySessions.filter(isLive);
  if (live.length === 0) return false;
  const target = dailyTarget(goal);
  if (target.amount === null) return live.some((s) => s.amount > 0);
  return amountTowardGoal(goal, live) >= target.amount;
}

export function amountTowardGoal(goal: GoalLike, sessions: readonly SessionLike[]): number {
  let total = 0;
  for (const s of sessions) {
    if (isLive(s)) total += amountFor(goal, s);
  }
  return total;
}

export interface Percent {
  /** Unclamped, may exceed 100. */
  raw: number;
  /** Clamped to [0, 100] and rounded for display. */
  display: number;
}

export function percent(actual: number, target: number): Percent {
  if (target <= 0) return { raw: 0, display: 0 };
  const raw = (Math.max(0, actual) / target) * 100;
  return { raw, display: Math.min(100, Math.max(0, Math.floor(raw))) };
}
