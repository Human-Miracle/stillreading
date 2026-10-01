import { describe, expect, it } from "vitest";
import { computePace } from "@/lib/domain/pace";
import { participantProgress } from "@/lib/domain/progress";
import { computeStreaks } from "@/lib/domain/streaks";
import { goalFromPreset } from "@/lib/domain/goals";
import type { SessionLike } from "@/lib/domain/types";

describe("pace", () => {
  it("matches the spec example", () => {
    const pace = computePace({ totalTarget: 600, actual: 210, durationDays: 30, dayNumber: 15 });
    expect(pace).toMatchObject({ status: "behind", expected: 300, behindBy: 90, remaining: 390, remainingDays: 15, requiredDailyAverage: 26 });
  });
  it("reports ahead / on track / complete", () => {
    expect(computePace({ totalTarget: 600, actual: 320, durationDays: 30, dayNumber: 15 })).toMatchObject({ status: "ahead", aheadBy: 20 });
    expect(computePace({ totalTarget: 600, actual: 300, durationDays: 30, dayNumber: 15 }).status).toBe("on_track");
    expect(computePace({ totalTarget: 600, actual: 640, durationDays: 30, dayNumber: 15 })).toMatchObject({ status: "complete", remaining: 0, requiredDailyAverage: null });
  });
  it("handles the last day and before the start", () => {
    expect(computePace({ totalTarget: 600, actual: 500, durationDays: 30, dayNumber: 30 })).toMatchObject({ remainingDays: 0, requiredDailyAverage: null, behindBy: 100 });
    expect(computePace({ totalTarget: 600, actual: 0, durationDays: 30, dayNumber: 0 })).toMatchObject({ status: "upcoming", requiredDailyAverage: 20 });
  });
  it("never goes negative", () => {
    const p = computePace({ totalTarget: 600, actual: -50, durationDays: 30, dayNumber: 40 });
    expect(p.remaining).toBe(600);
    expect(p.remainingDays).toBe(0);
  });
});

describe("streaks", () => {
  const days = [true, true, true, false, true].map((goalMet, i) => ({ date: `2026-10-0${i + 1}`, goalMet }));

  it("matches the spec example: current 1, longest 3", () => {
    expect(computeStreaks(days, null)).toEqual({ current: 1, longest: 3 });
  });

  it("today in progress does not break the current streak", () => {
    const withToday = [...days, { date: "2026-10-06", goalMet: false }];
    expect(computeStreaks(withToday, "2026-10-06")).toEqual({ current: 1, longest: 3 });
  });

  it("a missed yesterday resets the current streak but keeps longest", () => {
    const missed = [...days, { date: "2026-10-06", goalMet: false }, { date: "2026-10-07", goalMet: false }];
    expect(computeStreaks(missed, "2026-10-07")).toEqual({ current: 0, longest: 3 });
  });
});

describe("participant progress", () => {
  const challenge = { startDate: "2026-10-01", endDate: "2026-10-30", durationDays: 30, timezone: "Africa/Lagos" };
  const goal = goalFromPreset({ kind: "pages_per_day", value: 20 }, 30);
  const session = (date: string, amount: number): SessionLike => ({ participantId: "pt_a", date, amount, unit: "pages" });

  it("computes the spec streak scenario with reading days and progress kept", () => {
    const sessions = [session("2026-10-01", 20), session("2026-10-02", 25), session("2026-10-03", 20), session("2026-10-05", 22)];
    const p = participantProgress({ challenge, goal, sessions, books: [], today: "2026-10-05" });
    expect(p.streak).toEqual({ current: 1, longest: 3 });
    expect(p.readingDays).toBe(4);
    expect(p.goalDays).toBe(4);
    expect(p.goal?.actual).toBe(87);
    expect(p.consistency.display).toBe(80);
    expect(p.clock.dayNumber).toBe(5);
  });

  it("partial day counts as reading but not a goal day", () => {
    const sessions = [session("2026-10-01", 19)];
    const p = participantProgress({ challenge, goal, sessions, books: [], today: "2026-10-02" });
    expect(p.readingDays).toBe(1);
    expect(p.goalDays).toBe(0);
    expect(p.missedYesterday).toBe(false);
  });

  it("today counts toward consistency only once met, and reports remaining", () => {
    const p = participantProgress({ challenge, goal, sessions: [session("2026-10-01", 20), session("2026-10-02", 18)], today: "2026-10-02", books: [] });
    expect(p.countedDays).toBe(1);
    expect(p.consistency.display).toBe(100);
    expect(p.today).toMatchObject({ amount: 18, target: 20, remaining: 2, goalMet: false, read: true });
  });

  it("flags a missed yesterday without erasing history", () => {
    const p = participantProgress({ challenge, goal, sessions: [session("2026-10-01", 20)], today: "2026-10-03", books: [] });
    expect(p.missedYesterday).toBe(true);
    expect(p.readingDays).toBe(1);
    expect(p.streak.longest).toBe(1);
  });

  it("uses the whole challenge after it ends", () => {
    const p = participantProgress({ challenge, goal, sessions: [session("2026-10-30", 20)], today: "2026-11-04", books: [] });
    expect(p.clock.phase).toBe("ended");
    expect(p.days).toHaveLength(30);
    expect(p.countedDays).toBe(30);
    expect(p.streak.current).toBe(1);
  });

  it("books goal counts completed books", () => {
    const booksGoal = goalFromPreset({ kind: "books", value: 2 }, 30);
    const p = participantProgress({
      challenge,
      goal: booksGoal,
      sessions: [],
      books: [
        { participantId: "pt_a", status: "completed" },
        { participantId: "pt_a", status: "reading" },
        { participantId: "pt_a", status: "completed", deletedAt: "2026-10-03T00:00:00Z" },
      ],
      today: "2026-10-05",
    });
    expect(p.goal).toMatchObject({ actual: 1, target: 2 });
    expect(p.goal?.percent.display).toBe(50);
  });

  it("measures late joiners from the day they joined", () => {
    const p = participantProgress({ challenge, goal: goalFromPreset({ kind: "pages_per_day", value: 20 }, 19), sessions: [session("2026-10-12", 18)], books: [], today: "2026-10-12", joinedDate: "2026-10-12" });
    expect(p.effectiveStart).toBe("2026-10-12");
    expect(p.effectiveDuration).toBe(19);
    expect(p.days).toHaveLength(1);
    expect(p.days[0]!.dayNumber).toBe(12);
    expect(p.missedYesterday).toBe(false);
    expect(p.goal).toMatchObject({ target: 380 });
    expect(p.goal!.pace).toMatchObject({ expected: 20, behindBy: 2, remainingDays: 18 });
    expect(p.consistency.display).toBe(0);
    expect(p.countedDays).toBe(0);
  });
});
