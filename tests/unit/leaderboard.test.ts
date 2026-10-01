import { describe, expect, it } from "vitest";
import { goalFromPreset } from "@/lib/domain/goals";
import { leaderboard, placeBonus } from "@/lib/domain/leaderboard";
import { participantProgress } from "@/lib/domain/progress";
import type { BookLike, SessionLike } from "@/lib/domain/types";

const challenge = { startDate: "2026-10-01", endDate: "2026-10-30", durationDays: 30, timezone: "UTC" };
const today = "2026-10-03";
const sess = (participantId: string, date: string, amount: number, unit: SessionLike["unit"] = "pages"): SessionLike => ({ participantId, date, amount, unit });

function row(id: string, name: string, kind: Parameters<typeof goalFromPreset>[0]["kind"], value: number, sessions: SessionLike[], books: BookLike[] = []) {
  return { participantId: id, displayName: name, progress: participantProgress({ challenge, goal: goalFromPreset({ kind, value }, 30), sessions, books, today }) };
}

describe("placeBonus", () => {
  it("rewards the top three places only", () => {
    expect([1, 2, 3, 4, null].map(placeBonus)).toEqual([30, 20, 10, 0, 0]);
  });
});

describe("leaderboard XP", () => {
  it("day one: more reading earns clearly more XP, whatever the unit (no three-way tie)", () => {
    const day1 = "2026-10-01";
    const board = leaderboard([
      { participantId: "p", displayName: "Dominion", progress: participantProgress({ challenge, goal: goalFromPreset({ kind: "pages_per_day", value: 20 }, 30), sessions: [sess("p", day1, 180)], books: [], today: day1 }) },
      { participantId: "m", displayName: "Jess", progress: participantProgress({ challenge, goal: goalFromPreset({ kind: "minutes_per_day", value: 30 }, 30), sessions: [sess("m", day1, 30, "minutes")], books: [], today: day1 }) },
      { participantId: "c", displayName: "Seraya", progress: participantProgress({ challenge, goal: goalFromPreset({ kind: "chapters_per_day", value: 1 }, 30), sessions: [sess("c", day1, 2, "chapters")], books: [], today: day1 }) },
    ]);
    // 180 pages ≈ 270 min of reading; 2 chapters ≈ 40 min; 30 minutes = 30 min.
    expect(board.map((e) => [e.displayName, e.xp, e.rank])).toEqual([
      ["Dominion", 430, 1],
      ["Seraya", 200, 2],
      ["Jess", 190, 3],
    ]);
  });

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
  const cat = (name: string, key: string) => by(name).categories.find((c) => c.key === key)!;

  it("earns XP per unit read, plus a placement bonus per stat", () => {
    expect(cat("Jessica", "pages")).toMatchObject({ value: 60, rank: 1, earned: 90, bonus: 30, xp: 120 });
    expect(cat("David", "pages")).toMatchObject({ value: 55, rank: 2, earned: 83, bonus: 20, xp: 103 });
    expect(cat("Amaka", "minutes")).toMatchObject({ value: 75, rank: 1, earned: 75, bonus: 30 });
    expect(cat("Amaka", "books")).toMatchObject({ value: 1, earned: 50, bonus: 30 });
    expect(cat("Amaka", "pages")).toMatchObject({ value: 0, rank: null, xp: 0 });
  });

  it("tied readers share a place and its bonus", () => {
    // Reading days: Jessica 3, David 2, Amaka 2 → David and Amaka share 2nd.
    expect(cat("David", "readingDays")).toMatchObject({ rank: 2, bonus: 20 });
    expect(cat("Amaka", "readingDays")).toMatchObject({ rank: 2, bonus: 20 });
  });

  it("totals XP and sorts readers, with no-progress readers last on 0 XP", () => {
    expect(board.map((e) => [e.displayName, e.xp])).toEqual([
      ["Jessica", 330],
      ["Amaka", 320],
      ["David", 178],
      ["Zed", 0],
    ]);
    for (const e of board) expect(e.xp).toBe(e.categories.reduce((s, c) => s + c.xp, 0));
    expect(by("Zed")).toMatchObject({ xp: 0, rank: 4, best: null });
  });

  it("identical reading still shares an overall rank", () => {
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
