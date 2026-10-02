import { describe, expect, it } from "vitest";
import { goalFromPreset } from "@/lib/domain/goals";
import { dailyLeaderboard, leaderboard, PAGE_XP } from "@/lib/domain/leaderboard";
import { participantProgress } from "@/lib/domain/progress";
import type { BookLike, SessionLike } from "@/lib/domain/types";

const challenge = { startDate: "2026-10-01", endDate: "2026-10-30", durationDays: 30, timezone: "UTC" };
const today = "2026-10-03";
const sess = (participantId: string, date: string, amount: number, unit: SessionLike["unit"] = "pages"): SessionLike => ({ participantId, date, amount, unit });

function row(
  id: string,
  name: string,
  kind: Parameters<typeof goalFromPreset>[0]["kind"],
  value: number,
  sessions: SessionLike[],
  books: BookLike[] = [],
  on = today,
) {
  return { participantId: id, displayName: name, progress: participantProgress({ challenge, goal: goalFromPreset({ kind, value }, 30), sessions, books, today: on }) };
}

describe("leaderboard XP", () => {
  it("pages are the main score: 43 pages beats readers who only logged minutes or chapters", () => {
    const day1 = "2026-10-01";
    const board = leaderboard([
      row("p", "You", "pages_per_day", 20, [sess("p", day1, 43)], [], day1),
      row("m", "Jess", "minutes_per_day", 30, [sess("m", day1, 60, "minutes")], [], day1),
      row("c", "Seraya", "chapters_per_day", 1, [sess("c", day1, 3, "chapters")], [], day1),
    ]);
    // Everyone hit their goal, read, and is on a 1-day streak: +25 +10 +5 each.
    expect(board.map((e) => [e.displayName, e.xp, e.rank])).toEqual([
      ["You", 43 * PAGE_XP + 40, 1],
      ["Jess", 60 + 40, 2],
      ["Seraya", 3 * 5 + 40, 3],
    ]);
    expect(board[0]).toMatchObject({ pages: 43, pageXp: 430, bonusXp: 40 });
  });

  it("minutes and chapters readers earn page XP for the pages they enter", () => {
    const day1 = "2026-10-01";
    const board = leaderboard([
      row("p", "Pages", "pages_per_day", 20, [sess("p", day1, 30)], [], day1),
      row("m", "Minutes", "minutes_per_day", 30, [{ ...sess("m", day1, 60, "minutes"), pages: 40 }], [], day1),
    ]);
    // Minutes: 40 pages (400) + 60 minutes (60) + goal, reading day, streak (40).
    expect(board.map((e) => [e.displayName, e.pages, e.xp])).toEqual([
      ["Minutes", 40, 500],
      ["Pages", 30, 340],
    ]);
  });

  it("add-ons can't lift a reader past someone who read clearly more pages", () => {
    const board = leaderboard([
      // 50 pages in one sitting, goal hit once.
      row("a", "Binge", "pages_per_day", 20, [sess("a", "2026-10-03", 50)]),
      // 30 pages over three days, goal hit every day.
      row("b", "Steady", "pages_per_day", 10, [sess("b", "2026-10-01", 10), sess("b", "2026-10-02", 10), sess("b", "2026-10-03", 10)]),
    ]);
    expect(board.map((e) => [e.displayName, e.xp])).toEqual([
      ["Binge", 500 + 25 + 10 + 5],
      ["Steady", 300 + 75 + 30 + 15],
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

  it("earns XP per unit: pages at full rate, everything else as small add-ons", () => {
    expect(cat("Jessica", "pages")).toMatchObject({ value: 60, rank: 1, xp: 600 });
    expect(cat("David", "pages")).toMatchObject({ value: 55, rank: 2, xp: 550 });
    expect(cat("Amaka", "minutes")).toMatchObject({ value: 75, rank: 1, xp: 75 });
    expect(cat("Amaka", "books")).toMatchObject({ value: 1, xp: 50 });
    expect(cat("Amaka", "pages")).toMatchObject({ value: 0, rank: null, xp: 0 });
    expect(cat("Jessica", "goalDays")).toMatchObject({ value: 3, xp: 75 });
  });

  it("totals XP and sorts readers, with no-progress readers last on 0 XP", () => {
    // Jessica: 600 + 3 goal days (75) + 3 reading days (30) + 3-day streak (15).
    // David: 550 + 1 goal day (25) + 2 reading days (20), streak broken.
    // Amaka: 75 minutes + 2 goal days (50) + 2 reading days (20) + 1-day streak (5) + a finished book (50).
    expect(board.map((e) => [e.displayName, e.xp])).toEqual([
      ["Jessica", 720],
      ["David", 595],
      ["Amaka", 200],
      ["Zed", 0],
    ]);
    for (const e of board) expect(e.xp).toBe(e.categories.reduce((s, c) => s + c.xp, 0));
    expect(by("Zed")).toMatchObject({ xp: 0, rank: 4, best: null });
  });

  it("labels readers by pages when they have any, otherwise by their biggest add-on", () => {
    expect(by("David").best).toMatchObject({ key: "pages", value: 55 });
    expect(by("Amaka").best).toMatchObject({ key: "minutes", value: 75 });
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

describe("daily leaderboard", () => {
  const day1 = "2026-10-01";
  const day2 = "2026-10-02";
  const pages20 = goalFromPreset({ kind: "pages_per_day", value: 20 }, 30);
  const minutes30 = goalFromPreset({ kind: "minutes_per_day", value: 30 }, 30);

  it("ranks readers by the XP they earned that day alone", () => {
    const readers = [
      { participantId: "a", displayName: "Ada", goal: pages20, sessions: [sess("a", day1, 100), sess("a", day2, 10)] },
      { participantId: "b", displayName: "Bola", goal: pages20, sessions: [sess("b", day1, 5), sess("b", day2, 15), sess("b", day2, 10)] },
      { participantId: "c", displayName: "Chidi", goal: minutes30, sessions: [{ ...sess("c", day2, 45, "minutes"), pages: 22 }] },
      { participantId: "d", displayName: "Dayo", goal: pages20, sessions: [sess("d", day1, 30)] },
    ];
    // Day 2: Chidi 22 pages + 45 minutes + goal + read; Bola 25 pages (two check-ins) + goal + read; Ada 10 pages + read.
    expect(dailyLeaderboard(readers, day2).map((e) => [e.displayName, e.pages, e.xp, e.rank])).toEqual([
      ["Chidi", 22, 220 + 45 + 25 + 10, 1],
      ["Bola", 25, 250 + 25 + 10, 2],
      ["Ada", 10, 100 + 10, 3],
    ]);
    // Day 1 is its own board: Dayo (no day-2 reading) is on it, Chidi isn't.
    expect(dailyLeaderboard(readers, day1).map((e) => e.displayName)).toEqual(["Ada", "Dayo", "Bola"]);
  });

  it("ignores deleted check-ins and days nobody read", () => {
    const readers = [{ participantId: "a", displayName: "Ada", goal: pages20, sessions: [{ ...sess("a", day1, 50), deletedAt: "2026-10-01T10:00:00Z" }] }];
    expect(dailyLeaderboard(readers, day1)).toEqual([]);
    expect(dailyLeaderboard(readers, "2026-10-05")).toEqual([]);
  });
});
