import { describe, expect, it } from "vitest";
import { participantProgress } from "@/lib/domain/progress";
import { canOpenDayOneWindow, inDayOneWindow, dayOneWindow, formatCountdown, hasDayOneBadge, DAY_ONE_WINDOW_MS } from "@/lib/domain/day-one";

const challenge = { startDate: "2026-10-01", endDate: "2026-10-30", durationDays: 30, timezone: "UTC" };
const at = (iso: string) => new Date(iso);

describe("day one window", () => {
  it("is unopened, then open for five minutes, then closed for good", () => {
    expect(dayOneWindow(null).state).toBe("unopened");
    const opensAt = "2026-10-12T10:00:00Z";
    expect(DAY_ONE_WINDOW_MS).toBe(300_000);
    expect(dayOneWindow(opensAt, at("2026-10-12T10:00:00Z"))).toMatchObject({ state: "open", msLeft: 300_000 });
    expect(dayOneWindow(opensAt, at("2026-10-12T10:04:59Z"))).toMatchObject({ state: "open", msLeft: 1000 });
    expect(dayOneWindow(opensAt, at("2026-10-12T10:05:00Z"))).toMatchObject({ state: "closed", msLeft: 0 });
    expect(dayOneWindow(opensAt, at("2026-11-30T10:00:00Z")).state).toBe("closed");
  });

  it("never shows more than the full window, even with a clock behind the server", () => {
    expect(dayOneWindow("2026-10-12T10:00:00Z", at("2026-10-12T09:59:00Z")).msLeft).toBe(300_000);
  });

  it("can be opened once, from Day 3 to the last day", () => {
    expect(canOpenDayOneWindow(challenge, at("2026-10-01T12:00:00Z"))).toBe(false);
    expect(canOpenDayOneWindow(challenge, at("2026-10-02T12:00:00Z"))).toBe(false);
    expect(canOpenDayOneWindow(challenge, at("2026-10-03T12:00:00Z"))).toBe(true);
    expect(canOpenDayOneWindow(challenge, at("2026-10-30T12:00:00Z"))).toBe(true);
    expect(canOpenDayOneWindow(challenge, at("2026-10-31T12:00:00Z"))).toBe(false);
    expect(canOpenDayOneWindow({ ...challenge, dayOneWindowOpensAt: "2026-10-05T12:00:00Z" }, at("2026-10-12T12:00:00Z"))).toBe(false);
  });

  it("accepts check-ins made inside the window, with a minute of slack for device clocks", () => {
    const opensAt = "2026-10-12T10:00:00Z";
    expect(inDayOneWindow(null, at("2026-10-12T10:01:00Z"))).toBe(false);
    expect(inDayOneWindow(opensAt, at("2026-10-12T10:01:00Z"))).toBe(true);
    expect(inDayOneWindow(opensAt, at("2026-10-12T09:59:30Z"))).toBe(true);
    expect(inDayOneWindow(opensAt, at("2026-10-12T10:05:30Z"))).toBe(true);
    expect(inDayOneWindow(opensAt, at("2026-10-12T10:07:00Z"))).toBe(false);
    expect(inDayOneWindow(opensAt, at("2026-10-13T10:01:00Z"))).toBe(false);
  });

  it("awards the badge for any live Day 1 check-in", () => {
    const s = { participantId: "pt_1", date: "2026-10-01", amount: 10, unit: "pages" as const };
    expect(hasDayOneBadge(challenge, [s])).toBe(true);
    expect(hasDayOneBadge(challenge, [{ ...s, deletedAt: "2026-10-02T00:00:00Z" }])).toBe(false);
    expect(hasDayOneBadge(challenge, [{ ...s, date: "2026-10-02" }])).toBe(false);
  });

  it("a late joiner who logged Day 1 counts from Day 1: no gap in the calendar, streak or reading days", () => {
    const goal = { goalType: "daily" as const, targetUnit: "pages" as const, targetValue: 10, frequency: "daily" as const, totalTarget: 300 };
    const read = (date: string) => ({ participantId: "pt_1", date, amount: 12, unit: "pages" as const });
    const days2to7 = ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"].map(read);
    const base = { challenge, goal, books: [], today: "2026-10-08", joinedDate: "2026-10-02" };

    const before = participantProgress({ ...base, sessions: days2to7 });
    expect(before.effectiveStart).toBe("2026-10-02");
    expect(before.streak.current).toBe(6);

    const after = participantProgress({ ...base, sessions: [read("2026-10-01"), ...days2to7] });
    expect(after.effectiveStart).toBe("2026-10-01");
    expect(after.days[0]).toMatchObject({ date: "2026-10-01", dayNumber: 1, read: true, goalMet: true });
    expect(after.streak.current).toBe(7);
    expect(after.readingDays).toBe(7);
    expect(after.countedDays).toBe(7);
  });

  it("formats the countdown", () => {
    expect(formatCountdown(300_000)).toBe("5:00");
    expect(formatCountdown(61_500)).toBe("1:02");
    expect(formatCountdown(0)).toBe("0:00");
  });
});
