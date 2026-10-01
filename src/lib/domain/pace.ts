export type PaceStatus = "upcoming" | "complete" | "ahead" | "on_track" | "behind";

export interface PaceInput {
  totalTarget: number;
  actual: number;
  durationDays: number;
  /** 1-based current challenge day (0 = not started). Values > duration are clamped. */
  dayNumber: number;
}

export interface PaceResult {
  status: PaceStatus;
  expected: number;
  behindBy: number;
  aheadBy: number;
  remaining: number;
  /** Days left after today. */
  remainingDays: number;
  /** Average per remaining day needed to reach the target; null when no days remain or done. */
  requiredDailyAverage: number | null;
}

/**
 * End-of-day pace, matching the spec example:
 * 600 pages, day 15 of 30, 210 read → expected 300, behind 90, needs ceil(390 / 15) = 26/day.
 */
export function computePace({ totalTarget, actual, durationDays, dayNumber }: PaceInput): PaceResult {
  const day = Math.min(Math.max(0, Math.floor(dayNumber)), durationDays);
  const safeActual = Math.max(0, actual);
  const expected = durationDays > 0 ? Math.round((totalTarget * day) / durationDays) : 0;
  const remaining = Math.max(0, totalTarget - safeActual);
  const remainingDays = Math.max(0, durationDays - day);
  const behindBy = Math.max(0, expected - safeActual);
  const aheadBy = Math.max(0, safeActual - expected);
  const requiredDailyAverage = remaining > 0 && remainingDays > 0 ? Math.ceil(remaining / remainingDays) : null;

  let status: PaceStatus;
  if (remaining === 0) status = "complete";
  else if (day === 0) status = "upcoming";
  else if (behindBy > 0) status = "behind";
  else if (aheadBy > 0) status = "ahead";
  else status = "on_track";

  return { status, expected, behindBy, aheadBy, remaining, remainingDays, requiredDailyAverage };
}
