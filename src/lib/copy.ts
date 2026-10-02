import { formatAmount, unitLabel } from "@/lib/domain/goals";
import type { PaceResult } from "@/lib/domain/pace";
import type { ParticipantProgress } from "@/lib/domain/progress";
import type { GroupStats } from "@/lib/domain/stats";
import type { GoalLike } from "@/lib/domain/types";

/** Friendly, never-shaming pace copy. */
export function paceCopy(goal: GoalLike, pace: PaceResult): { headline: string; detail: string | null } {
  const u = goal.targetUnit;
  switch (pace.status) {
    case "complete":
      return { headline: "Goal reached 🎉", detail: "Anything more is a bonus." };
    case "upcoming":
      return { headline: "Ready when you are", detail: pace.requiredDailyAverage ? `That's about ${formatAmount(pace.requiredDailyAverage, u)} a day.` : null };
    case "ahead":
      return { headline: "Ahead of pace", detail: `You're ${formatAmount(pace.aheadBy, u)} ahead. Keep going!` };
    case "on_track":
      return { headline: "On track", detail: "Right where you planned to be." };
    case "behind":
      if (pace.requiredDailyAverage === null) {
        return { headline: "Last stretch", detail: `${formatAmount(pace.remaining, u)} to go. You can still make it.` };
      }
      return {
        headline: "You can still make it",
        detail: `You're ${formatAmount(pace.behindBy, u)} behind your original pace. You need about ${formatAmount(pace.requiredDailyAverage, u)}/day for the remaining ${pace.remainingDays} day${pace.remainingDays === 1 ? "" : "s"} to reach your goal.`,
      };
  }
}

export function todayLine(goal: GoalLike | null, p: ParticipantProgress): string {
  if (!goal) return p.today.read ? "You read today. Nice work." : "Log your first reading today.";
  if (p.today.goalMet) return "Today's goal is done. Nice work!";
  if (p.today.target === null) return p.today.read ? "Nice work. You showed up today." : "Any amount counts. Show up today.";
  if (p.today.amount > 0) return `${formatAmount(p.today.remaining, goal.targetUnit)} to goal. Almost there.`;
  return `Read ${formatAmount(p.today.target, goal.targetUnit)} today.`;
}

/** Positive social proof for the home screen. */
export function crewLine(stats: GroupStats, meCheckedIn: boolean): string | null {
  if (stats.participantCount <= 1) return null;
  if (stats.checkedInToday === 0) return "No one has checked in yet today. Be the first. 📚";
  if (!meCheckedIn) return "Your reading crew is already showing up today. 📚";
  if (stats.todayTotals.pages > 0) return `Your reading crew has read ${stats.todayTotals.pages.toLocaleString("en-US")} pages today.`;
  return `${stats.checkedInToday} of ${stats.participantCount} people have checked in today.`;
}

export function amountSummary(totals: Record<"pages" | "chapters" | "minutes", number>): string {
  const parts = (["pages", "chapters", "minutes"] as const).filter((u) => totals[u] > 0).map((u) => `${totals[u].toLocaleString("en-US")} ${unitLabel(u, totals[u])}`);
  return parts.length ? parts.join(" · ") : "—";
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** "two", "three" … "ten", then digits. */
export const countWord = (n: number) => WORDS[n] ?? String(n);

/** The small banner above heroes (reference: "Wow! 25 days without a break"). Follows the challenge day. */
export function streakBanner(p: ParticipantProgress, crewStreaks: number[], durationDays: number): { title: string; sub: string } {
  const phase = p.clock.phase;
  if (phase === "upcoming") return { title: `Starts in ${p.clock.startsInDays} day${p.clock.startsInDays === 1 ? "" : "s"}`, sub: "Invite your crew while you wait" };
  if (phase === "ended") return { title: `You showed up for ${p.readingDays} day${p.readingDays === 1 ? "" : "s"}`, sub: `Longest streak: ${p.streak.longest} day${p.streak.longest === 1 ? "" : "s"}` };
  const day = p.clock.dayNumber;
  const n = p.streak.current;
  const doneToday = p.today.goalMet;
  if (n >= 2) {
    const others = crewStreaks.length;
    const behind = crewStreaks.filter((s) => s < n).length;
    const pct = others ? Math.round((behind / others) * 100) : 0;
    const sub = !doneToday ? `Read today to make it ${countWord(n + 1)} in a row` : pct > 0 ? `You're ahead of ${pct}% of your crew` : "Keep the chain going";
    return { title: `Wow! ${n} days without a break`, sub };
  }
  // A one-day streak that is today: just started. One that is yesterday: today can extend it.
  if (n === 1 && doneToday) return { title: `Day ${day}: your streak starts here`, sub: day < durationDays ? "Come back tomorrow to make it two" : "What a way to finish" };
  if (n === 1) return { title: `Day ${day} of ${durationDays}`, sub: "You read yesterday. Read today to make it two in a row" };
  if (p.missedYesterday && !p.today.read) return { title: "You missed yesterday. That's okay.", sub: `Start again today, on day ${day}` };
  return { title: `Day ${day} of ${durationDays}`, sub: p.today.read ? "Nice work showing up today" : "A few pages is all it takes" };
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
