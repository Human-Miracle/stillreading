"use client";
import { formatAmount, unitLabel } from "@/lib/domain/goals";
import { todayLine } from "@/lib/copy";
import type { MemberView } from "@/local/hooks";
import { Button } from "../ui/button";
import { Card, Eyebrow } from "../ui/card";
import { ProgressBar } from "../ui/progress";
import { StreakBadge } from "./streak-badge";

export function DailyGoalCard({ me, onCheckIn, canCheckIn }: { me: MemberView; onCheckIn: () => void; canCheckIn: boolean }) {
  const p = me.progress;
  const goal = me.goal;
  const target = p.today.target;
  const unit = goal?.targetUnit ?? "pages";
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>Your daily goal</Eyebrow>
        <StreakBadge days={p.streak.current} />
      </div>
      {target !== null ? (
        <>
          <p className="font-display text-5xl font-semibold tabular leading-none">
            {p.today.amount}
            <span className="text-2xl text-muted"> / {target} {unitLabel(unit, target)}</span>
          </p>
          <ProgressBar value={(p.today.amount / target) * 100} label="Today's goal progress" tone={p.today.goalMet ? "success" : "accent"} />
        </>
      ) : (
        <p className="font-display text-4xl font-semibold leading-tight">{p.today.read ? "Read today ✓" : "Not yet today"}</p>
      )}
      <p className="text-ink-2" aria-live="polite">
        {todayLine(goal, p)}
        {p.today.read && target !== null && goal && p.today.goalMet && p.today.amount > target ? ` (${formatAmount(p.today.amount, unit)} today)` : ""}
      </p>
      {canCheckIn ? (
        <Button size="lg" full onClick={onCheckIn}>
          <span aria-hidden className="text-xl leading-none">
            +
          </span>{" "}
          LOG READING
        </Button>
      ) : null}
    </Card>
  );
}
