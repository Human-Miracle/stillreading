import { diffDays, todayInTimezone } from "./dates";
import { isLive } from "./goals";
import type { ChallengeLike, SessionLike } from "./types";

/**
 * The Day One window: once per challenge, the host can open a short window in which every member may
 * log reading for Day 1, which earns the Day One badge. When it closes it never opens again.
 */
export const DAY_ONE_WINDOW_MS = 3 * 60_000;

/** Slack for device clocks that run a little ahead of or behind the server's. */
export const DAY_ONE_CLOCK_SLACK_MS = 60_000;

export type DayOneWindowState = "unopened" | "open" | "closed";

export interface DayOneWindow {
  state: DayOneWindowState;
  opensAt: Date | null;
  closesAt: Date | null;
  /** Milliseconds until it closes (0 unless open). */
  msLeft: number;
}

export function dayOneWindow(opensAt: string | Date | null | undefined, now: Date = new Date()): DayOneWindow {
  if (!opensAt) return { state: "unopened", opensAt: null, closesAt: null, msLeft: 0 };
  const start = new Date(opensAt);
  const closesAt = new Date(start.getTime() + DAY_ONE_WINDOW_MS);
  const msLeft = closesAt.getTime() - now.getTime();
  return { state: msLeft > 0 ? "open" : "closed", opensAt: start, closesAt, msLeft: Math.min(DAY_ONE_WINDOW_MS, Math.max(0, msLeft)) };
}

/** The host can open the window once, on any active day after Day 1 (on Day 1 everyone can log it anyway). */
export function canOpenDayOneWindow(challenge: ChallengeLike & { dayOneWindowOpensAt?: string | Date | null }, now: Date = new Date()): boolean {
  if (challenge.dayOneWindowOpensAt) return false;
  const today = todayInTimezone(challenge.timezone, now);
  return diffDays(challenge.startDate, today) >= 1 && diffDays(today, challenge.endDate) >= 0;
}

/**
 * Whether a Day 1 check-in created at `createdAt` is allowed. Check-ins made on Day 1 or Day 2 (the
 * normal "today" / "yesterday") always are; later ones only while the Day One window was open.
 */
export function dayOneCheckInAllowed(
  challenge: ChallengeLike & { dayOneWindowOpensAt?: string | Date | null },
  createdAt: Date,
): boolean {
  if (diffDays(challenge.startDate, todayInTimezone(challenge.timezone, createdAt)) <= 1) return true;
  const w = dayOneWindow(challenge.dayOneWindowOpensAt, createdAt);
  if (!w.opensAt || !w.closesAt) return false;
  const t = createdAt.getTime();
  return t >= w.opensAt.getTime() - DAY_ONE_CLOCK_SLACK_MS && t <= w.closesAt.getTime() + DAY_ONE_CLOCK_SLACK_MS;
}

/** Anyone with a live check-in dated Day 1 holds the Day One badge. */
export function hasDayOneBadge(challenge: Pick<ChallengeLike, "startDate">, sessions: readonly SessionLike[]): boolean {
  return sessions.some((s) => isLive(s) && s.date === challenge.startDate && s.amount > 0);
}

export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
