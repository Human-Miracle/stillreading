import { describe, expect, it } from "vitest";
import { nameKey, possibleDuplicates } from "@/lib/domain/duplicates";
import { goalFromPreset } from "@/lib/domain/goals";
import { participantProgress } from "@/lib/domain/progress";
import { groupStats } from "@/lib/domain/stats";
import type { SessionLike } from "@/lib/domain/types";

const challenge = { startDate: "2026-10-01", endDate: "2026-10-30", durationDays: 30, timezone: "UTC" };
const today = "2026-10-03";
const sess = (participantId: string, date: string, amount: number, unit: SessionLike["unit"] = "pages"): SessionLike => ({ participantId, date, amount, unit });

function row(id: string, name: string, kind: Parameters<typeof goalFromPreset>[0]["kind"], value: number, sessions: SessionLike[]) {
  return { participantId: id, displayName: name, progress: participantProgress({ challenge, goal: goalFromPreset({ kind, value }, 30), sessions, books: [], today }) };
}

describe("group stats", () => {
  const rows = [
    row("a", "Jessica", "pages_per_day", 20, [sess("a", "2026-10-01", 20), sess("a", "2026-10-02", 20), sess("a", "2026-10-03", 20)]),
    row("b", "David", "pages_per_day", 30, [sess("b", "2026-10-01", 45), sess("b", "2026-10-02", 10)]),
    row("c", "Amaka", "minutes_per_day", 30, [sess("c", "2026-10-01", 30, "minutes"), sess("c", "2026-10-03", 45, "minutes")]),
  ];
  const stats = groupStats(rows);

  it("never mixes units into one score", () => {
    expect(stats.totals).toEqual({ pages: 115, chapters: 0, minutes: 75 });
    expect(stats.leaders.mostPages).toMatchObject({ displayName: "Jessica", value: 60 });
    expect(stats.leaders.mostMinutes).toMatchObject({ displayName: "Amaka", value: 75 });
    expect(stats.leaders.mostChapters).toBeNull();
  });

  it("computes participation, streaks and consistency", () => {
    expect(stats.participantCount).toBe(3);
    expect(stats.checkedInToday).toBe(2);
    expect(stats.participationToday).toBe(67);
    expect(stats.leaders.currentStreak).toMatchObject({ displayName: "Jessica", value: 3 });
    expect(stats.leaders.mostConsistent).toMatchObject({ displayName: "Jessica", value: 100 });
    expect(stats.longestStreak).toBe(3);
  });
});

describe("possibleDuplicates", () => {
  const m = (id: string, displayName: string) => ({ id, displayName });
  it("groups members whose first names match or one starts the other", () => {
    const groups = possibleDuplicates([m("1", "Temi"), m("2", "David"), m("3", " témi O."), m("4", "Temitope"), m("5", "Jo"), m("6", "John"), m("7", "Dave")]);
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([["1", "3", "4"]]);
    expect(nameKey("  Jess  A. ")).toBe("jess");
  });
});
