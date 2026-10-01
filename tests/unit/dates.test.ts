import { describe, expect, it } from "vitest";
import {
  addDays,
  challengeClockForDate,
  dateRange,
  diffDays,
  endDateFor,
  isDateKey,
  isWithinChallenge,
  participantDuration,
  participantStart,
  todayInTimezone,
} from "@/lib/domain/dates";

const challenge = { startDate: "2026-10-01", endDate: "2026-10-30", durationDays: 30, timezone: "Africa/Lagos" };

describe("dates", () => {
  it("computes today in the challenge timezone, not the device timezone", () => {
    // 23:30 UTC on Sep 30 is already Oct 1 in Lagos (UTC+1) but still Sep 30 in New York.
    const now = new Date("2026-09-30T23:30:00Z");
    expect(todayInTimezone("Africa/Lagos", now)).toBe("2026-10-01");
    expect(todayInTimezone("America/New_York", now)).toBe("2026-09-30");
    expect(todayInTimezone("Pacific/Kiritimati", now)).toBe("2026-10-01");
  });

  it("does day arithmetic across DST and month boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2);
    expect(diffDays("2026-10-30", "2026-10-01")).toBe(-29);
    expect(endDateFor("2026-10-01", 30)).toBe("2026-10-30");
    expect(dateRange("2026-10-29", "2026-11-02")).toEqual(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("validates date keys", () => {
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(isDateKey("2026-1-01")).toBe(false);
  });

  it("derives challenge phase and day number", () => {
    expect(challengeClockForDate(challenge, "2026-09-28")).toMatchObject({ phase: "upcoming", dayNumber: 0, startsInDays: 3, lastCountableDate: null });
    expect(challengeClockForDate(challenge, "2026-10-01")).toMatchObject({ phase: "active", dayNumber: 1, daysRemaining: 29 });
    expect(challengeClockForDate(challenge, "2026-10-12")).toMatchObject({ phase: "active", dayNumber: 12, daysRemaining: 18 });
    expect(challengeClockForDate(challenge, "2026-10-30")).toMatchObject({ phase: "active", dayNumber: 30, daysRemaining: 0 });
    expect(challengeClockForDate(challenge, "2026-10-31")).toMatchObject({ phase: "ended", dayNumber: 30, lastCountableDate: "2026-10-30" });
  });

  it("checks whether a date is inside the challenge", () => {
    expect(isWithinChallenge(challenge, "2026-09-30")).toBe(false);
    expect(isWithinChallenge(challenge, "2026-10-01")).toBe(true);
    expect(isWithinChallenge(challenge, "2026-10-30")).toBe(true);
    expect(isWithinChallenge(challenge, "2026-10-31")).toBe(false);
  });

  it("computes a participant's effective start and duration", () => {
    expect(participantStart(challenge, null)).toBe("2026-10-01");
    expect(participantStart(challenge, "2026-09-20")).toBe("2026-10-01");
    expect(participantStart(challenge, "2026-10-12")).toBe("2026-10-12");
    expect(participantDuration(challenge, "2026-10-12")).toBe(19);
    expect(participantDuration(challenge, "2026-11-12")).toBe(1);
  });
});
