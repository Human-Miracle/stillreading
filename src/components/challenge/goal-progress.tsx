import { describeGoal, formatAmount } from "@/lib/domain/goals";
import { paceCopy } from "@/lib/copy";
import type { MemberView } from "@/local/hooks";
import { Card, Eyebrow } from "../ui/card";
import { ProgressRing } from "../ui/progress";

export function GoalProgress({ me, title = "Your challenge goal" }: { me: MemberView; title?: string }) {
  const goal = me.goal;
  const g = me.progress.goal;
  if (!goal || !g) return null;
  const pace = paceCopy(goal, g.pace);
  return (
    <Card className="flex items-center gap-5">
      <ProgressRing value={g.percent.display} label="Challenge goal" tone={g.pace.status === "complete" ? "success" : "accent"} size={104}>
        <span className="font-display text-2xl font-semibold tabular">{g.percent.display}%</span>
      </ProgressRing>
      <div className="min-w-0 flex-1 space-y-1">
        <Eyebrow>{title}</Eyebrow>
        <p className="font-display text-2xl font-semibold tabular">
          {g.actual.toLocaleString("en-US")} <span className="text-lg text-muted">/ {formatAmount(g.target, goal.targetUnit)}</span>
        </p>
        <p className="text-sm text-muted">{describeGoal(goal)}</p>
        <p className="pt-1 font-semibold">{pace.headline}</p>
        {pace.detail ? <p className="text-sm text-ink-2">{pace.detail}</p> : null}
      </div>
    </Card>
  );
}
