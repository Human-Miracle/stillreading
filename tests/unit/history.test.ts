import { describe, expect, it } from "vitest";
import { goalFromPreset } from "@/lib/domain/goals";
import { groupStatsOn } from "@/lib/domain/history";
import { participantProgress } from "@/lib/domain/progress";
import { groupStats } from "@/lib/domain/stats";
import type { SessionLike } from "@/lib/domain/types";

const challenge = { startDate: "2026-10-01", endDate: "2026-10-31", durationDays: 31, timezone: "UTC" };
const sess = (participantId: string, date: string, amount: number, unit: SessionLike["unit"] = "pages"): SessionLike => ({ participantId, date, amount, unit });
const pages20 = goalFromPreset({ kind: "pages_per_day", value: 20 }, 31);
const minutes30 = goalFromPreset({ kind: "minutes_per_day", value: 30 }, 31);

const readers = [
  { participantId: "j", displayName: "Jess", goal: pages20, sessions: [sess("j", "2026-10-01", 25), sess("j", "2026-10-02", 30), sess("j", "2026-10-03", 40)], books: [], joinedDate: null },
  { participantId: "t", displayName: "Temi", goal: minutes30, sessions: [{ ...sess("t", "2026-10-01", 45, "minutes"), pages: 12 }, sess("t", "2026-10-03", 10)], books: [], joinedDate: "2026-09-30" },
  { participantId: "m", displayName: "Mosope", goal: pages20, sessions: [sess("m", "2026-10-02", 5)], books: [], joinedDate: "2026-10-01" },
  { participantId: "l", displayName: "Late", goal: pages20, sessions: [sess("l", "2026-10-03", 50)], books: [], joinedDate: "2026-10-03" },
];

describe("groupStatsOn", () => {
  it("recaps a past day: that day's reading and check-ins, running totals as of its end", () => {
    const day2 = groupStatsOn(challenge, readers, "2026-10-02");
    expect(day2.todayTotals).toEqual({ pages: 35, chapters: 0, minutes: 0 });
    expect(day2.checkedInToday).toBe(2);
    expect(day2.participantCount).toBe(3); // "Late" hadn't joined yet.
    expect(day2.totals.pages).toBe(25 + 30 + 12 + 5); // Nothing from day 3.
    expect(day2.longestStreak).toBe(2);
  });

  it("counts the recapped day as finished for consistency", () => {
    // Day 2: Jess hit both days (100%), Temi day 1 only (50%), Mosope missed day 1 and fell short on day 2 (0%).
    expect(groupStatsOn(challenge, readers, "2026-10-02").averageConsistency).toBe(50);
  });

  it("matches what the crew's numbers were for that day's reading", () => {
    const live = groupStats(
      readers.map((r) => ({ participantId: r.participantId, displayName: r.displayName, progress: participantProgress({ challenge, goal: r.goal, sessions: r.sessions, books: r.books, today: "2026-10-03", joinedDate: r.joinedDate }) })),
    );
    const day3 = groupStatsOn(challenge, readers, "2026-10-03");
    expect(day3.todayTotals).toEqual(live.todayTotals);
    expect(day3.checkedInToday).toBe(live.checkedInToday);
    expect(day3.totals).toEqual(live.totals);
    expect(day3.participantCount).toBe(live.participantCount);
  });
});
