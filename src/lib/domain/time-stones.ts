import { addDays, todayInTimezone } from "./dates";
import type { DateKey } from "./types";

/**
 * Time Stones: a reader earns one for every {@link TIME_STONE_EVERY} days they read in a challenge and
 * can hold up to {@link TIME_STONE_MAX}. Spending one logs reading for a day they missed, but only the
 * day right after it: miss Monday, use it on Tuesday; by Wednesday Monday is gone. The restored day
 * counts like any other (streak, goal, XP, badges), apart from the time-of-day badges.
 *
 * Logging yesterday is free until {@link TIME_STONE_GRACE_HOURS} am (reading late, logging just after
 * midnight), and adding to a day that already has a check-in is always free: a stone is for a day
 * that was missed. A spent stone stays spent, even if that check-in is deleted later.
 *
 * Worked out from the reader's check-ins alone, so every phone and the server agree.
 */
export const TIME_STONE_EVERY = 7;
export const TIME_STONE_MAX = 2;
export const TIME_STONE_GRACE_HOURS = 3;

export interface StoneSessionLike {
  date: DateKey;
  createdAt: string;
  deletedAt: string | null;
  timeStone?: boolean | null;
}

export interface TimeStoneWallet {
  /** Stones ready to use. */
  held: number;
  /** Days with a check-in (each one counts towards the next stone). */
  readingDays: number;
  /** Reading days until the next stone; 0 while the wallet is full. */
  toNext: number;
  /** Days brought back with a stone. */
  restored: Set<DateKey>;
}

/** One reader's stones, from all their check-ins in the challenge (deleted ones included). */
export function timeStoneWallet(sessions: readonly StoneSessionLike[]): TimeStoneWallet {
  // A reading day happens when its first check-in that still stands was made.
  const firstLog = new Map<DateKey, string>();
  for (const s of sessions) {
    if (s.deletedAt) continue;
    const at = firstLog.get(s.date);
    if (!at || s.createdAt < at) firstLog.set(s.date, s.createdAt);
  }
  // A stone is spent by the first check-in that used it, deleted or not.
  const spent = new Map<DateKey, string>();
  for (const s of sessions) {
    if (!s.timeStone) continue;
    const at = spent.get(s.date);
    if (!at || s.createdAt < at) spent.set(s.date, s.createdAt);
  }

  const events = [
    ...[...firstLog.values()].map((at) => ({ at, use: false })),
    ...[...spent.values()].map((at) => ({ at, use: true })),
  ].sort((a, b) => a.at.localeCompare(b.at) || Number(b.use) - Number(a.use)); // A stone is spent before its day counts.

  let held = 0;
  let readingDays = 0;
  for (const e of events) {
    if (e.use) held = Math.max(0, held - 1);
    else if (++readingDays % TIME_STONE_EVERY === 0) held = Math.min(TIME_STONE_MAX, held + 1);
  }
  return {
    held,
    readingDays,
    toNext: held >= TIME_STONE_MAX ? 0 : TIME_STONE_EVERY - (readingDays % TIME_STONE_EVERY),
    restored: new Set(spent.keys()),
  };
}

/** The hour (0–23) of `now` in an IANA timezone. */
export function hourInTimezone(timezone: string, now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number.parseInt(h, 10) % 24;
}

export type BackfillCost = "free" | "stone";

/**
 * What logging reading for `date` costs at `now`: a stone when it's for yesterday, past the grace
 * hours, and yesterday has no check-in yet (and hasn't been restored already). Anything else that's
 * allowed at all is free.
 */
export function backfillCost(sessions: readonly StoneSessionLike[], date: DateKey, timezone: string, now: Date = new Date()): BackfillCost {
  const today = todayInTimezone(timezone, now);
  if (date !== addDays(today, -1)) return "free";
  if (hourInTimezone(timezone, now) < TIME_STONE_GRACE_HOURS) return "free";
  if (sessions.some((s) => s.date === date && !s.deletedAt)) return "free";
  if (sessions.some((s) => s.date === date && s.timeStone)) return "free";
  return "stone";
}
