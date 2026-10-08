import { challengeClockForDate, dateRange, diffDays, type ChallengeClock } from "./dates";
import { readerStart } from "./day-one";
import { amountTowardGoal, dailyTarget, isGoalDay, isLive, percent, sumByUnit, type Percent } from "./goals";
import { computePace, type PaceResult } from "./pace";
import { computeStreaks } from "./streaks";
import type { BookLike, ChallengeLike, DateKey, GoalLike, SessionLike, SessionUnit } from "./types";

export interface DayRow {
  date: DateKey;
  dayNumber: number;
  totals: Record<SessionUnit, number>;
  read: boolean;
  goalMet: boolean;
}

export interface ParticipantProgress {
  clock: ChallengeClock;
  /** First counted day: the challenge start, or the join day for late joiners who haven't logged Day 1. */
  effectiveStart: DateKey;
  /** Challenge days available to this participant. */
  effectiveDuration: number;
  days: DayRow[];
  readingDays: number;
  goalDays: number;
  /** Days that have fully elapsed, plus today once today's goal is met. */
  countedDays: number;
  consistency: Percent;
  streak: { current: number; longest: number };
  totals: Record<SessionUnit, number>;
  booksCompleted: number;
  today: {
    totals: Record<SessionUnit, number>;
    read: boolean;
    goalMet: boolean;
    /** Amount toward the daily target in the goal's unit (null target = any reading). */
    amount: number;
    target: number | null;
    remaining: number;
  };
  /** Missed yesterday (and yesterday was a challenge day) — used for "welcome back" copy. */
  missedYesterday: boolean;
  goal: {
    actual: number;
    target: number;
    percent: Percent;
    pace: PaceResult;
  } | null;
}

export interface ProgressInput {
  challenge: ChallengeLike;
  goal: GoalLike | null | undefined;
  /** This participant's sessions (deleted rows are ignored). */
  sessions: readonly SessionLike[];
  books: readonly BookLike[];
  today: DateKey;
  /** Calendar date (challenge timezone) the participant joined; omit for the host / founding members. */
  joinedDate?: DateKey | null;
}

export function participantProgress({ challenge, goal, sessions, books, today, joinedDate }: ProgressInput): ParticipantProgress {
  const clock = challengeClockForDate(challenge, today);
  const effectiveStart = readerStart(challenge, joinedDate, sessions);
  const offset = diffDays(challenge.startDate, effectiveStart);
  const effectiveDuration = challenge.durationDays - offset;
  const live = sessions.filter(isLive);
  const byDate = new Map<DateKey, SessionLike[]>();
  for (const s of live) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }

  const dates =
    clock.lastCountableDate && diffDays(effectiveStart, clock.lastCountableDate) >= 0 ? dateRange(effectiveStart, clock.lastCountableDate) : [];
  const days: DayRow[] = dates.map((date, i) => {
    const list = byDate.get(date) ?? [];
    const read = list.some((s) => s.amount > 0);
    return {
      date,
      dayNumber: offset + i + 1,
      totals: sumByUnit(list),
      read,
      goalMet: goal ? isGoalDay(goal, list) : read,
    };
  });

  const readingDays = days.filter((d) => d.read).length;
  const goalDays = days.filter((d) => d.goalMet).length;
  const todayRow = days.find((d) => d.date === today);
  const isActiveToday = clock.phase === "active";
  const countedDays = Math.max(0, isActiveToday ? days.length - 1 + (todayRow?.goalMet ? 1 : 0) : days.length);
  const streak = computeStreaks(days, isActiveToday ? today : null);

  const todaySessions = byDate.get(today) ?? [];
  const target = goal ? dailyTarget(goal).amount : null;
  const todayAmount = goal ? amountTowardGoal(goal, todaySessions) : 0;
  const todayRead = todayRow?.read ?? false;

  const yesterday = days.length >= 2 && isActiveToday ? days[days.length - 2] : undefined;

  const booksCompleted = books.filter((b) => isLive(b) && b.status === "completed").length;

  let goalBlock: ParticipantProgress["goal"] = null;
  if (goal) {
    const actual =
      goal.targetUnit === "days" ? readingDays : goal.targetUnit === "books" ? booksCompleted : amountTowardGoal(goal, live);
    goalBlock = {
      actual,
      target: goal.totalTarget,
      percent: percent(actual, goal.totalTarget),
      pace: computePace({ totalTarget: goal.totalTarget, actual, durationDays: effectiveDuration, dayNumber: Math.max(0, clock.dayNumber - offset) }),
    };
  }

  return {
    clock,
    effectiveStart,
    effectiveDuration,
    days,
    readingDays,
    goalDays,
    countedDays,
    consistency: percent(goalDays, countedDays),
    streak,
    totals: sumByUnit(live),
    booksCompleted,
    today: {
      totals: sumByUnit(todaySessions),
      read: todayRead,
      goalMet: todayRow?.goalMet ?? false,
      amount: todayAmount,
      target,
      remaining: target === null ? (todayRead ? 0 : 1) : Math.max(0, target - todayAmount),
    },
    missedYesterday: yesterday ? !yesterday.read : false,
    goal: goalBlock,
  };
}
