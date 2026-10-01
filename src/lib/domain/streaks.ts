import type { DateKey } from "./types";

export interface DayResult {
  date: DateKey;
  goalMet: boolean;
}

export interface StreakResult {
  current: number;
  longest: number;
}

/**
 * Streaks over consecutive challenge days, oldest first.
 * `days` should run from the challenge start to the last countable date (today or the end date).
 * If the final day is `today` and its goal is not met yet, it is treated as "in progress": the current
 * streak is counted from yesterday instead of resetting to zero.
 */
export function computeStreaks(days: readonly DayResult[], today: DateKey | null): StreakResult {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.goalMet ? run + 1 : 0;
    if (run > longest) longest = run;
  }

  let current = 0;
  let i = days.length - 1;
  const last = days[i];
  if (last && last.date === today && !last.goalMet) i -= 1;
  for (; i >= 0; i--) {
    if (!days[i]!.goalMet) break;
    current += 1;
  }
  return { current, longest };
}
