import { describe, expect, it } from "vitest";
import { amountTowardGoal, describeGoal, formatSession, goalFromPreset, isGoalDay, pagesRead, percent, presetFromGoal, sumByUnit } from "@/lib/domain/goals";
import type { SessionLike } from "@/lib/domain/types";

const s = (amount: number, unit: SessionLike["unit"] = "pages", extra: Partial<SessionLike> = {}): SessionLike => ({
  participantId: "pt_a",
  date: "2026-10-01",
  amount,
  unit,
  ...extra,
});

describe("goal presets", () => {
  it("20 pages/day over 30 days has a 600 page total target", () => {
    const goal = goalFromPreset({ kind: "pages_per_day", value: 20 }, 30);
    expect(goal).toEqual({ goalType: "daily", targetUnit: "pages", targetValue: 20, frequency: "daily", totalTarget: 600 });
    expect(describeGoal(goal)).toBe("20 pages/day");
  });

  it("supports every preset and round-trips", () => {
    for (const kind of ["every_day", "pages_per_day", "chapters_per_day", "minutes_per_day", "books", "total_pages"] as const) {
      const goal = goalFromPreset({ kind, value: 3 }, 30);
      expect(presetFromGoal(goal).kind).toBe(kind);
    }
    expect(goalFromPreset({ kind: "every_day", value: 99 }, 14).totalTarget).toBe(14);
    expect(goalFromPreset({ kind: "books", value: 2 }, 30)).toMatchObject({ goalType: "total", frequency: "challenge", totalTarget: 2 });
  });
});

describe("goal days", () => {
  const goal = goalFromPreset({ kind: "pages_per_day", value: 20 }, 30);

  it("20 pages meets a 20 pages/day goal, 19 does not", () => {
    expect(isGoalDay(goal, [s(20)])).toBe(true);
    expect(isGoalDay(goal, [s(19)])).toBe(false);
  });

  it("sums multiple sessions on one day", () => {
    expect(isGoalDay(goal, [s(12), s(8)])).toBe(true);
  });

  it("ignores other units and deleted sessions", () => {
    expect(isGoalDay(goal, [s(19), s(30, "minutes")])).toBe(false);
    expect(isGoalDay(goal, [s(25, "pages", { deletedAt: "2026-10-01T10:00:00Z" })])).toBe(false);
  });

  it("any reading counts for every-day and total goals", () => {
    expect(isGoalDay(goalFromPreset({ kind: "every_day", value: 1 }, 30), [s(1, "minutes")])).toBe(true);
    expect(isGoalDay(goalFromPreset({ kind: "books", value: 2 }, 30), [s(3)])).toBe(true);
    expect(isGoalDay(goalFromPreset({ kind: "books", value: 2 }, 30), [])).toBe(false);
  });
});

describe("percent", () => {
  it("caps display at 100 but keeps raw", () => {
    expect(percent(700, 600)).toEqual({ raw: (700 / 600) * 100, display: 100 });
  });
  it("never produces negatives or NaN", () => {
    expect(percent(-5, 600).display).toBe(0);
    expect(percent(10, 0)).toEqual({ raw: 0, display: 0 });
  });
});

describe("pages from every check-in", () => {
  const minutes = { participantId: "a", date: "2026-10-01", amount: 30, unit: "minutes" as const, pages: 14 };
  const chapters = { participantId: "a", date: "2026-10-01", amount: 2, unit: "chapters" as const, pages: 41 };
  const pages = { participantId: "a", date: "2026-10-01", amount: 20, unit: "pages" as const };
  const legacy = { participantId: "a", date: "2026-10-01", amount: 45, unit: "minutes" as const };

  it("counts pages entered with minutes and chapters", () => {
    expect([minutes, chapters, pages, legacy].map(pagesRead)).toEqual([14, 41, 20, 0]);
    expect(sumByUnit([minutes, chapters, pages, legacy])).toEqual({ pages: 75, chapters: 2, minutes: 75 });
  });

  it("counts those pages toward a pages goal, but leaves minutes and chapters goals unchanged", () => {
    const pagesGoal = goalFromPreset({ kind: "pages_per_day", value: 50 }, 30);
    const minutesGoal = goalFromPreset({ kind: "minutes_per_day", value: 30 }, 30);
    expect(amountTowardGoal(pagesGoal, [minutes, chapters])).toBe(55);
    expect(isGoalDay(pagesGoal, [minutes, chapters])).toBe(true);
    expect(amountTowardGoal(minutesGoal, [minutes, chapters, pages])).toBe(30);
  });

  it("describes a check-in with its pages", () => {
    expect(formatSession(minutes)).toBe("30 minutes · 14 pages");
    expect(formatSession(pages)).toBe("20 pages");
    expect(formatSession(legacy)).toBe("45 minutes");
  });
});
