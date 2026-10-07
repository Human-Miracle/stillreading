import { describe, expect, it } from "vitest";
import { BADGES, badgeKey, badgeName, badgeRarity, computeBadges, type BadgeInput, type BadgeReader, type BadgeResult } from "@/lib/domain/badges";
import { addDays } from "@/lib/domain/dates";
import { goalFromPreset } from "@/lib/domain/goals";

const challenge = { startDate: "2026-10-01", endDate: "2026-10-10", durationDays: 10, timezone: "UTC" };
const goal = goalFromPreset({ kind: "pages_per_day", value: 20 }, 10);
let n = 0;
/** A check-in for `date`, logged at `time` (UTC) on that day unless `loggedOn` says otherwise. */
const s = (pid: string, date: string, amount: number, time = "12:00", loggedOn = date) => ({
  id: `rs_${String(++n).padStart(26, "0")}`,
  participantId: pid,
  date,
  amount,
  unit: "pages" as const,
  createdAt: `${loggedOn}T${time}:00.000Z`,
});
const reader = (pid: string, sessions: BadgeReader["sessions"], extra: Partial<BadgeReader> = {}): BadgeReader => ({
  participantId: pid,
  displayName: pid,
  goal,
  sessions,
  books: [],
  joinedDate: null,
  ...extra,
});
const days = (from: string, count: number) => Array.from({ length: count }, (_, i) => addDays(from, i));
const run = (input: Partial<BadgeInput> & { readers: BadgeReader[] }) => computeBadges({ challenge, today: "2026-10-10", reactions: [], replies: [], ...input });
const get = (all: Map<string, BadgeResult[]>, pid: string, id: string) => all.get(pid)!.find((b) => b.id === id)!;

describe("badges", () => {
  it("defines 21 badges with names", () => {
    expect(BADGES).toHaveLength(21);
    expect(badgeName("time_traveller", 1)).toBe("Time Traveller");
    expect(badgeName("efiko", 1)).toBe("Efiko");
    expect(badgeName("the_end", 2)).toBe("Bookworm");
    expect(badgeKey({ id: "page_turner", level: 3 })).toBe("page_turner:3");
  });

  it("first page, day one, streaks and Efiko for someone who read every day", () => {
    const all = run({ readers: [reader("ada", days("2026-10-01", 10).map((d) => s("ada", d, 25)))] });
    expect(get(all, "ada", "first_page")).toMatchObject({ level: 1, earnedOn: "2026-10-01", stat: "Day 1 · 25 pages" });
    expect(get(all, "ada", "day_one")).toMatchObject({ level: 1 });
    expect(get(all, "ada", "hat_trick")).toMatchObject({ level: 1, earnedOn: "2026-10-03" });
    expect(get(all, "ada", "week_warrior")).toMatchObject({ level: 1, earnedOn: "2026-10-07" });
    expect(get(all, "ada", "fortnight_focus")).toMatchObject({ level: 0, progress: { current: 10, target: 14 } });
    expect(get(all, "ada", "efiko")).toMatchObject({ level: 1, earnedOn: "2026-10-10", stat: "Read all 10 days" });
    expect(get(all, "ada", "page_turner")).toMatchObject({ level: 1, earnedOn: "2026-10-10", progress: { current: 250, target: 500 } });
    expect(get(all, "ada", "goal_getter")).toMatchObject({ level: 1, earnedOn: "2026-10-07" });
  });

  it("Efiko is closed after a missed day; before the end it shows progress", () => {
    const missed = run({ today: "2026-10-05", readers: [reader("bo", ["2026-10-01", "2026-10-03", "2026-10-04"].map((d) => s("bo", d, 10)))] });
    expect(get(missed, "bo", "efiko")).toMatchObject({ level: 0, closed: true });
    const going = run({ today: "2026-10-04", readers: [reader("cy", days("2026-10-01", 4).map((d) => s("cy", d, 10)))] });
    expect(get(going, "cy", "efiko")).toMatchObject({ level: 0, closed: false, progress: { current: 4, target: 10 } });
  });

  it("Time Traveller: each missed day brought back with a Time Stone", () => {
    const stone = (date: string, loggedOn: string) => ({ ...s("tia", date, 15, "09:00", loggedOn), timeStone: true });
    const once = run({ readers: [reader("tia", [s("tia", "2026-10-01", 20), stone("2026-10-02", "2026-10-03"), s("tia", "2026-10-03", 20)])] });
    // Earned the day the stone was used, for the day it brought back.
    expect(get(once, "tia", "time_traveller")).toMatchObject({ level: 1, earnedOn: "2026-10-03", count: 1, stat: "Brought back day 2" });

    const twice = run({ readers: [reader("tia", [stone("2026-10-02", "2026-10-03"), s("tia", "2026-10-02", 5, "10:00", "2026-10-03"), stone("2026-10-06", "2026-10-07")])] });
    expect(get(twice, "tia", "time_traveller")).toMatchObject({ level: 1, count: 2, stat: "2 missed days brought back" });

    // A late check-in that didn't use a stone, or a deleted one that did, doesn't count.
    const none = run({
      readers: [reader("tia", [s("tia", "2026-10-02", 5, "01:00", "2026-10-03"), { ...stone("2026-10-05", "2026-10-06"), deletedAt: "2026-10-06T12:00:00.000Z" }])],
    });
    expect(get(none, "tia", "time_traveller")).toMatchObject({ level: 0, count: 0 });
  });

  it("Comeback: read, miss two days, then three in a row", () => {
    const dates = ["2026-10-01", "2026-10-04", "2026-10-05", "2026-10-06"];
    const all = run({ readers: [reader("di", dates.map((d) => s("di", d, 5)))] });
    expect(get(all, "di", "comeback")).toMatchObject({ level: 1, earnedOn: "2026-10-06" });
    const noGap = run({ readers: [reader("ed", ["2026-10-01", "2026-10-03", "2026-10-04", "2026-10-05"].map((d) => s("ed", d, 5)))] });
    expect(get(noGap, "ed", "comeback").level).toBe(0);
  });

  it("Early Bird goes to the first same-day log; backfills don't count; dawn and night owl by the clock", () => {
    const all = run({
      readers: [
        reader("fe", [s("fe", "2026-10-02", 10, "05:30"), s("fe", "2026-10-03", 10, "23:10")]),
        reader("gu", [s("gu", "2026-10-02", 10, "08:00"), s("gu", "2026-10-03", 10, "01:00", "2026-10-04")]), // backfilled at 1am
      ],
    });
    expect(get(all, "fe", "early_bird")).toMatchObject({ level: 1, count: 2 });
    expect(get(all, "gu", "early_bird").level).toBe(0);
    expect(get(all, "fe", "dawn_reader")).toMatchObject({ level: 1, earnedOn: "2026-10-02" });
    expect(get(all, "fe", "night_owl").level).toBe(1);
    expect(get(all, "gu", "night_owl").level).toBe(1); // 1am, logging the night before
  });

  it("weekend reader, century and page levels", () => {
    // 2026-10-03 is a Saturday.
    const all = run({ readers: [reader("ha", [s("ha", "2026-10-03", 120), s("ha", "2026-10-04", 400), s("ha", "2026-10-06", 500)])] });
    expect(get(all, "ha", "weekend_reader")).toMatchObject({ level: 1, count: 1, earnedOn: "2026-10-04" });
    expect(get(all, "ha", "century")).toMatchObject({ level: 1, count: 3, stat: "500 pages in a day" });
    expect(get(all, "ha", "page_turner")).toMatchObject({ level: 3, earnedOn: "2026-10-06", progress: { current: 1020, target: 2500 } });
  });

  it("The End, then Bookworm at three books", () => {
    const books = (k: number) => Array.from({ length: k }, (_, i) => ({ participantId: "io", status: "completed" as const, completedAt: `2026-10-0${i + 2}T10:00:00Z` }));
    expect(get(run({ readers: [reader("io", [], { books: books(1) })] }), "io", "the_end")).toMatchObject({ level: 1, progress: { current: 1, target: 3 } });
    expect(get(run({ readers: [reader("io", [], { books: books(3) })] }), "io", "the_end")).toMatchObject({ level: 2, earnedOn: "2026-10-04" });
  });

  it("leaderboard badges are decided at the end of each day", () => {
    const readers = [
      reader("a", [s("a", "2026-10-01", 50), s("a", "2026-10-02", 10)]),
      reader("b", [s("b", "2026-10-01", 40), s("b", "2026-10-02", 10)]),
      reader("c", [s("c", "2026-10-01", 30)]),
      reader("d", [s("d", "2026-10-01", 20)]),
      reader("e", [s("e", "2026-10-01", 15)]),
      reader("f", [s("f", "2026-10-01", 12)]),
      reader("g", [s("g", "2026-10-01", 5), s("g", "2026-10-02", 200)]),
    ];
    const all = run({ today: "2026-10-03", readers });
    expect(get(all, "a", "top_of_shelf")).toMatchObject({ level: 1, earnedOn: "2026-10-01", count: 1 });
    expect(get(all, "g", "top_of_shelf")).toMatchObject({ level: 1, earnedOn: "2026-10-02" });
    expect(get(all, "g", "climber")).toMatchObject({ level: 1, earnedOn: "2026-10-02", stat: "Up 6 places in a day" });
    expect(get(all, "c", "podium")).toMatchObject({ level: 1, count: 1 });
    expect(get(all, "a", "daily_champion")).toMatchObject({ level: 1, earnedOn: "2026-10-01" });
    expect(get(all, "g", "daily_champion")).toMatchObject({ level: 1, earnedOn: "2026-10-02" });
    // Today isn't over: nothing from day 3 yet.
    expect(badgeRarity(all, "top_of_shelf", 1)).toEqual({ holders: 2, readers: 7 });
  });

  it("Hype Squad counts cheers and replies on other people's check-ins", () => {
    const mine = s("j", "2026-10-02", 10);
    const theirs = days("2026-10-01", 10).map((d) => s("k", d, 10));
    const reactions = theirs.flatMap((t, i) => [
      { participantId: "j", sessionId: t.id, createdAt: `2026-10-0${Math.min(i + 1, 9)}T09:00:00Z` },
      { participantId: "j", sessionId: t.id, createdAt: `2026-10-0${Math.min(i + 1, 9)}T09:01:00Z` },
    ]);
    const replies = theirs.slice(0, 5).map((t) => ({ participantId: "j", sessionId: t.id, createdAt: "2026-10-09T10:00:00Z" }));
    const own = [{ participantId: "j", sessionId: mine.id, createdAt: "2026-10-02T10:00:00Z" }];
    const all = run({ readers: [reader("j", [mine]), reader("k", theirs)], reactions: [...reactions, ...own], replies });
    expect(get(all, "j", "hype_squad")).toMatchObject({ level: 1, stat: "25 cheers for the crew" });
    const fewer = run({ readers: [reader("j", [mine]), reader("k", theirs)], reactions: reactions.slice(0, 10) });
    expect(get(fewer, "j", "hype_squad")).toMatchObject({ level: 0, progress: { current: 10, target: 25 } });
  });
});
