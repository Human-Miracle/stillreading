import { describe, expect, it } from "vitest";
import { goalFromPreset } from "@/lib/domain/goals";
import { leaderboard, MIN_XP, RANK_XP, xpForRank } from "@/lib/domain/leaderboard";
import { participantProgress } from "@/lib/domain/progress";
import type { BookLike, SessionLike } from "@/lib/domain/types";

const challenge = { startDate: "2026-10-01", endDate: "2026-10-30", durationDays: 30, timezone: "UTC" };
const today = "2026-10-03";
const sess = (participantId: string, date: string, amount: number, unit: SessionLike["unit"] = "pages"): SessionLike => ({ participantId, date, amount, unit });

function row(id: string, name: string, kind: Parameters<typeof goalFromPreset>[0]["kind"], value: number, sessions: SessionLike[], books: BookLike[] = []) {
  return { participantId: id, displayName: name, progress: participantProgress({ challenge, goal: goalFromPreset({ kind, value }, 30), sessions, books, today }) };
}

describe("xpForRank", () => {
  it("follows the rank table, then the floor", () => {
    expect(xpForRank(1)).toBe(RANK_XP[0]);
    expect(xpForRank(3)).toBe(RANK_XP[2]);
    expect(xpForRank(RANK_XP.length + 5)).toBe(MIN_XP);
  });
});

describe("leaderboard", () => {
  const rows = [
    row("a", "Jessica", "pages_per_day", 20, [sess("a", "2026-10-01", 20), sess("a", "2026-10-02", 20), sess("a", "2026-10-03", 20)]),
    row("b", "David", "pages_per_day", 30, [sess("b", "2026-10-01", 45), sess("b", "2026-10-02", 10)]),
    row("c", "Amaka", "minutes_per_day", 30, [sess("c", "2026-10-01", 30, "minutes"), sess("c", "2026-10-03", 45, "minutes")], [
      { participantId: "c", status: "completed" },
    ]),
    row("d", "Zed", "pages_per_day", 10, []),
  ];
  const board = leaderboard(rows);
  const by = (name: string) => board.find((e) => e.displayName === name)!;

  it("ranks each stat separately, so units are never added together", () => {
    // Amaka leads minutes and books while Jessica leads pages: each earns first-place XP for their own race.
    const amaka = by("Amaka");
    expect(amaka.categories.find((c) => c.key === "minutes")).toMatchObject({ value: 75, rank: 1, xp: 100 });
    expect(amaka.categories.find((c) => c.key === "pages")).toMatchObject({ value: 0, rank: null, xp: 0 });
    expect(amaka.categories.find((c) => c.key === "books")).toMatchObject({ rank: 1, xp: 100 });
    expect(by("Jessica").categories.find((c) => c.key === "pages")).toMatchObject({ value: 60, rank: 1, xp: 100 });
    expect(by("David").categories.find((c) => c.key === "pages")).toMatchObject({ value: 55, rank: 2, xp: 80 });
  });

  it("gives tied readers the same place", () => {
    // Reading days: Jessica 3, David 2, Amaka 2 → David and Amaka share 2nd.
    const days = (name: string) => by(name).categories.find((c) => c.key === "readingDays")!;
    expect(days("Jessica")).toMatchObject({ rank: 1, xp: 100 });
    expect(days("David")).toMatchObject({ rank: 2, xp: 80 });
    expect(days("Amaka")).toMatchObject({ rank: 2, xp: 80 });
  });

  it("totals XP and sorts readers, with no-progress readers last on 0 XP", () => {
    // Amaka: streak 2nd (80) + consistency 2nd (80) + reading days 2nd (80) + minutes 1st (100) + books 1st (100).
    // Jessica: streak, consistency, reading days and pages all 1st (4 × 100).
    expect(board.map((e) => [e.displayName, e.xp])).toEqual([
      ["Amaka", 440],
      ["Jessica", 400],
      ["David", 225],
      ["Zed", 0],
    ]);
    for (const e of board) expect(e.xp).toBe(e.categories.reduce((s, c) => s + c.xp, 0));
    expect(board[0]!.rank).toBe(1);
    expect(by("Zed")).toMatchObject({ xp: 0, rank: 4, best: null });
  });

  it("shares an overall rank on equal XP", () => {
    const twins = leaderboard([
      row("x", "Bea", "pages_per_day", 20, [sess("x", "2026-10-01", 20)]),
      row("y", "Ada", "pages_per_day", 20, [sess("y", "2026-10-01", 20)]),
    ]);
    expect(twins.map((e) => [e.displayName, e.rank])).toEqual([
      ["Ada", 1],
      ["Bea", 1],
    ]);
  });
});
