export const SESSION_UNITS = ["pages", "chapters", "minutes"] as const;
export type SessionUnit = (typeof SESSION_UNITS)[number];

export const GOAL_UNITS = ["pages", "chapters", "minutes", "books", "days"] as const;
export type GoalUnit = (typeof GOAL_UNITS)[number];

export type GoalType = "daily" | "total";
export type GoalFrequency = "daily" | "challenge";
export type GoalPriority = "primary" | "secondary";

export const REACTION_TYPES = ["heart", "fire", "clap", "book"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export const BOOK_STATUSES = ["planned", "reading", "completed", "abandoned"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

/** ISO calendar date in the challenge timezone, e.g. "2026-10-01". */
export type DateKey = string;

export interface ChallengeLike {
  startDate: DateKey;
  endDate: DateKey;
  durationDays: number;
  timezone: string;
}

export interface GoalLike {
  goalType: GoalType;
  targetUnit: GoalUnit;
  targetValue: number;
  frequency: GoalFrequency;
  totalTarget: number;
}

export interface SessionLike {
  participantId: string;
  date: DateKey;
  amount: number;
  unit: SessionUnit;
  /** Pages covered during a minutes or chapters check-in (pages check-ins use `amount`). */
  pages?: number | null;
  bookId?: string | null;
  deletedAt?: string | null;
}

export interface BookLike {
  participantId: string;
  status: BookStatus;
  deletedAt?: string | null;
}
