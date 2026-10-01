import type { ChallengeLike, DateKey } from "./types";

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: string): value is DateKey {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Calendar date (YYYY-MM-DD) of `now` in an IANA timezone. */
export function todayInTimezone(timezone: string, now: Date = new Date()): DateKey {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function toUtc(date: DateKey): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: DateKey, days: number): DateKey {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `a` to `b` (b - a). Timezone-free, DST-safe. */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

export function dateRange(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

export function endDateFor(startDate: DateKey, durationDays: number): DateKey {
  return addDays(startDate, durationDays - 1);
}

export type ChallengePhase = "upcoming" | "active" | "ended";

export interface ChallengeClock {
  today: DateKey;
  phase: ChallengePhase;
  /** 1-based day number, clamped to [0, duration]. 0 when upcoming. */
  dayNumber: number;
  /** Days remaining after today (0 on the last day / after the end). */
  daysRemaining: number;
  /** Days until the start when upcoming. */
  startsInDays: number;
  /** Last date that may hold reading: min(today, endDate), or null if upcoming. */
  lastCountableDate: DateKey | null;
}

export function challengeClock(challenge: ChallengeLike, now: Date = new Date()): ChallengeClock {
  const today = todayInTimezone(challenge.timezone, now);
  return challengeClockForDate(challenge, today);
}

export function challengeClockForDate(challenge: ChallengeLike, today: DateKey): ChallengeClock {
  const sinceStart = diffDays(challenge.startDate, today);
  const duration = challenge.durationDays;
  if (sinceStart < 0) {
    return { today, phase: "upcoming", dayNumber: 0, daysRemaining: duration, startsInDays: -sinceStart, lastCountableDate: null };
  }
  if (diffDays(today, challenge.endDate) < 0) {
    return { today, phase: "ended", dayNumber: duration, daysRemaining: 0, startsInDays: 0, lastCountableDate: challenge.endDate };
  }
  const dayNumber = sinceStart + 1;
  return { today, phase: "active", dayNumber, daysRemaining: duration - dayNumber, startsInDays: 0, lastCountableDate: today };
}

/** Day number (1-based) of a given date within the challenge. */
export function dayNumberOf(challenge: ChallengeLike, date: DateKey): number {
  return diffDays(challenge.startDate, date) + 1;
}

export function isWithinChallenge(challenge: ChallengeLike, date: DateKey): boolean {
  return diffDays(challenge.startDate, date) >= 0 && diffDays(date, challenge.endDate) >= 0;
}

/**
 * First day that counts for a participant: the challenge start, or the day they joined if later.
 * Late joiners are measured from the day they joined, never from days they could not have read.
 */
export function participantStart(challenge: ChallengeLike, joinedDate?: DateKey | null): DateKey {
  if (!joinedDate || diffDays(challenge.startDate, joinedDate) <= 0) return challenge.startDate;
  return diffDays(joinedDate, challenge.endDate) >= 0 ? joinedDate : challenge.endDate;
}

/** Number of challenge days available to a participant who joined on `joinedDate`. */
export function participantDuration(challenge: ChallengeLike, joinedDate?: DateKey | null): number {
  return diffDays(participantStart(challenge, joinedDate), challenge.endDate) + 1;
}

/** Join day in the challenge timezone; hosts count from the challenge start. */
export function joinedDateFor(challenge: ChallengeLike, participant: { role: string; joinedAt: string | Date }): DateKey | null {
  if (participant.role === "host") return null;
  return todayInTimezone(challenge.timezone, new Date(participant.joinedAt));
}
