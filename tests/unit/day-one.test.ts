import { describe, expect, it } from "vitest";
import { canOpenDayOneWindow, dayOneCheckInAllowed, dayOneWindow, formatCountdown, hasDayOneBadge, DAY_ONE_WINDOW_MS } from "@/lib/domain/day-one";

const challenge = { startDate: "2026-10-01", endDate: "2026-10-30", durationDays: 30, timezone: "UTC" };
const at = (iso: string) => new Date(iso);

describe("day one window", () => {
  it("is unopened, then open for three minutes, then closed for good", () => {
    expect(dayOneWindow(null).state).toBe("unopened");
    const opensAt = "2026-10-12T10:00:00Z";
    expect(DAY_ONE_WINDOW_MS).toBe(180_000);
    expect(dayOneWindow(opensAt, at("2026-10-12T10:00:00Z"))).toMatchObject({ state: "open", msLeft: 180_000 });
    expect(dayOneWindow(opensAt, at("2026-10-12T10:02:59Z"))).toMatchObject({ state: "open", msLeft: 1000 });
    expect(dayOneWindow(opensAt, at("2026-10-12T10:03:00Z"))).toMatchObject({ state: "closed", msLeft: 0 });
    expect(dayOneWindow(opensAt, at("2026-11-30T10:00:00Z")).state).toBe("closed");
  });

  it("never shows more than the full window, even with a clock behind the server", () => {
    expect(dayOneWindow("2026-10-12T10:00:00Z", at("2026-10-12T09:59:00Z")).msLeft).toBe(180_000);
  });

  it("can be opened once, from Day 2 to the last day", () => {
    expect(canOpenDayOneWindow(challenge, at("2026-10-01T12:00:00Z"))).toBe(false);
    expect(canOpenDayOneWindow(challenge, at("2026-10-02T12:00:00Z"))).toBe(true);
    expect(canOpenDayOneWindow(challenge, at("2026-10-30T12:00:00Z"))).toBe(true);
    expect(canOpenDayOneWindow(challenge, at("2026-10-31T12:00:00Z"))).toBe(false);
    expect(canOpenDayOneWindow({ ...challenge, dayOneWindowOpensAt: "2026-10-05T12:00:00Z" }, at("2026-10-12T12:00:00Z"))).toBe(false);
  });

  it("allows Day 1 check-ins made on Day 1 or 2, and later ones only inside the window", () => {
    expect(dayOneCheckInAllowed(challenge, at("2026-10-01T20:00:00Z"))).toBe(true);
    expect(dayOneCheckInAllowed(challenge, at("2026-10-02T20:00:00Z"))).toBe(true);
    expect(dayOneCheckInAllowed(challenge, at("2026-10-12T10:01:00Z"))).toBe(false);
    const opened = { ...challenge, dayOneWindowOpensAt: "2026-10-12T10:00:00Z" };
    expect(dayOneCheckInAllowed(opened, at("2026-10-12T10:01:00Z"))).toBe(true);
    expect(dayOneCheckInAllowed(opened, at("2026-10-12T10:03:30Z"))).toBe(true); // clock slack
    expect(dayOneCheckInAllowed(opened, at("2026-10-12T10:05:00Z"))).toBe(false);
    expect(dayOneCheckInAllowed(opened, at("2026-10-13T10:01:00Z"))).toBe(false);
  });

  it("awards the badge for any live Day 1 check-in", () => {
    const s = { participantId: "pt_1", date: "2026-10-01", amount: 10, unit: "pages" as const };
    expect(hasDayOneBadge(challenge, [s])).toBe(true);
    expect(hasDayOneBadge(challenge, [{ ...s, deletedAt: "2026-10-02T00:00:00Z" }])).toBe(false);
    expect(hasDayOneBadge(challenge, [{ ...s, date: "2026-10-02" }])).toBe(false);
  });

  it("formats the countdown", () => {
    expect(formatCountdown(180_000)).toBe("3:00");
    expect(formatCountdown(61_500)).toBe("1:02");
    expect(formatCountdown(0)).toBe("0:00");
  });
});
