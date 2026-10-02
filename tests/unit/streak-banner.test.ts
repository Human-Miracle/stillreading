import { describe, expect, it } from "vitest";
import { streakBanner } from "@/lib/copy";
import { goalFromPreset } from "@/lib/domain/goals";
import { participantProgress } from "@/lib/domain/progress";
import type { SessionLike } from "@/lib/domain/types";

const challenge = { startDate: "2026-10-01", endDate: "2026-10-31", durationDays: 31, timezone: "UTC" };
const sess = (date: string, amount = 100): SessionLike => ({ participantId: "a", date, amount, unit: "pages" });
const banner = (today: string, sessions: SessionLike[]) =>
  streakBanner(participantProgress({ challenge, goal: goalFromPreset({ kind: "pages_per_day", value: 100 }, 31), sessions, books: [], today }), [], 31);

describe("streak banner", () => {
  it("on day 2, after reading only on day 1, asks for today rather than tomorrow", () => {
    expect(banner("2026-10-02", [sess("2026-10-01")])).toEqual({ title: "Day 2 of 31", sub: "You read yesterday. Read today to make it two in a row" });
  });

  it("calls a streak started once today's goal is met", () => {
    expect(banner("2026-10-02", [sess("2026-10-02")])).toEqual({ title: "Day 2: your streak starts here", sub: "Come back tomorrow to make it two" });
  });

  it("counts up with the challenge", () => {
    expect(banner("2026-10-03", [sess("2026-10-01"), sess("2026-10-02")])).toMatchObject({ title: "Wow! 2 days without a break", sub: "Read today to make it three in a row" });
    expect(banner("2026-10-05", [])).toMatchObject({ title: "You missed yesterday. That's okay.", sub: "Start again today, on day 5" });
    expect(banner("2026-10-01", [])).toEqual({ title: "Day 1 of 31", sub: "A few pages is all it takes" });
  });
});
