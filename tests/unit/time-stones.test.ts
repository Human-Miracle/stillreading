import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/domain/dates";
import { backfillCost, hourInTimezone, timeStoneWallet, type StoneSessionLike } from "@/lib/domain/time-stones";

const START = "2026-10-01";
/** A check-in for day `n` (1-based), made on that day at noon UTC unless `at` says otherwise. */
function log(n: number, opts: { at?: string; stone?: boolean; deleted?: boolean } = {}): StoneSessionLike {
  const date = addDays(START, n - 1);
  return { date, createdAt: opts.at ?? `${date}T12:00:00.000Z`, deletedAt: opts.deleted ? "2026-12-01T00:00:00.000Z" : null, timeStone: opts.stone ?? false };
}
const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => log(from + i));

describe("time stone wallet", () => {
  it("earns one stone every 7 reading days", () => {
    expect(timeStoneWallet(days(1, 6))).toMatchObject({ held: 0, readingDays: 6, toNext: 1 });
    expect(timeStoneWallet(days(1, 7))).toMatchObject({ held: 1, readingDays: 7, toNext: 7 });
    expect(timeStoneWallet(days(1, 10))).toMatchObject({ held: 1, toNext: 4 });
  });

  it("counts reading days, not calendar days or check-ins", () => {
    const gappy = [log(1), log(1, { at: "2026-10-01T20:00:00.000Z" }), log(3), log(5), log(8), log(9), log(12)];
    expect(timeStoneWallet(gappy)).toMatchObject({ held: 0, readingDays: 6 });
    expect(timeStoneWallet([...gappy, log(13)]).held).toBe(1);
  });

  it("holds at most two; a third is lost while full", () => {
    expect(timeStoneWallet(days(1, 14))).toMatchObject({ held: 2, toNext: 0 });
    expect(timeStoneWallet(days(1, 21))).toMatchObject({ held: 2, toNext: 0 });
  });

  it("spends a stone on a restored day, which still counts as a reading day", () => {
    // Read days 1–7, missed day 8, restored it on day 9.
    const sessions = [...days(1, 7), log(8, { at: "2026-10-09T10:00:00.000Z", stone: true })];
    const w = timeStoneWallet(sessions);
    expect(w).toMatchObject({ held: 0, readingDays: 8, toNext: 6 });
    expect([...w.restored]).toEqual(["2026-10-08"]);
  });

  it("a spent stone stays spent when its check-in is deleted", () => {
    const sessions = [...days(1, 7), log(8, { at: "2026-10-09T10:00:00.000Z", stone: true, deleted: true })];
    expect(timeStoneWallet(sessions)).toMatchObject({ held: 0, readingDays: 7 });
  });

  it("a restored day that is the 7th reading day earns the next stone after paying", () => {
    // 7 days → 1 stone; days 9–14 (6 more) then restore day 15 on day 16: that's reading day 14.
    const sessions = [...days(1, 7), ...days(9, 14), log(15, { at: "2026-10-16T09:00:00.000Z", stone: true })];
    expect(timeStoneWallet(sessions)).toMatchObject({ held: 1, readingDays: 14 });
  });

  it("never goes below zero on odd data", () => {
    expect(timeStoneWallet([log(2, { stone: true })]).held).toBe(0);
  });
});

describe("what logging a past day costs", () => {
  const tz = "Africa/Lagos"; // UTC+1, no DST
  const at = (iso: string) => new Date(iso);

  it("knows the hour in the challenge's timezone", () => {
    expect(hourInTimezone(tz, at("2026-10-09T01:30:00Z"))).toBe(2);
    expect(hourInTimezone(tz, at("2026-10-08T23:30:00Z"))).toBe(0);
  });

  it("today is always free", () => {
    expect(backfillCost([], "2026-10-09", tz, at("2026-10-09T15:00:00Z"))).toBe("free");
  });

  it("yesterday is free until 3am, then needs a stone", () => {
    expect(backfillCost([], "2026-10-08", tz, at("2026-10-09T01:59:00Z"))).toBe("free"); // 02:59 Lagos
    expect(backfillCost([], "2026-10-08", tz, at("2026-10-09T02:00:00Z"))).toBe("stone"); // 03:00 Lagos
  });

  it("adding to a day that already has a check-in is free", () => {
    expect(backfillCost([log(8)], "2026-10-08", tz, at("2026-10-09T15:00:00Z"))).toBe("free");
  });

  it("a day already restored doesn't need a second stone, even if that check-in was deleted", () => {
    const restored = log(8, { at: "2026-10-09T10:00:00.000Z", stone: true, deleted: true });
    expect(backfillCost([restored], "2026-10-08", tz, at("2026-10-09T15:00:00Z"))).toBe("free");
  });

  it("a deleted check-in doesn't make yesterday free", () => {
    expect(backfillCost([log(8, { deleted: true })], "2026-10-08", tz, at("2026-10-09T15:00:00Z"))).toBe("stone");
  });
});
