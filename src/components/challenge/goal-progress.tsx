import { describeGoal, unitLabel } from "@/lib/domain/goals";
import { paceCopy } from "@/lib/copy";
import type { MemberView } from "@/local/hooks";
import { Card, Eyebrow } from "../ui/card";
import { ProgressBar, type Tint } from "../ui/progress";

export function GoalProgress({ me, title = "Challenge goal", tint = "lavender" }: { me: MemberView; title?: string; tint?: Tint }) {
  const goal = me.goal;
  const g = me.progress.goal;
  if (!goal || !g) return null;
  const pace = paceCopy(goal, g.pace);
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>{title}</Eyebrow>
        <span className="text-xs text-muted">{describeGoal(goal)}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="display text-[56px] tabular">
          {g.actual.toLocaleString("en-US")}
          <span className="ml-1.5 text-lg tracking-[-0.02em] text-muted">
            / {g.target.toLocaleString("en-US")} {unitLabel(goal.targetUnit, g.target)}
          </span>
        </p>
        <p className="display pb-1 text-2xl tabular">{g.percent.display}%</p>
      </div>
      <ProgressBar value={g.percent.display} label={title} tint={g.pace.status === "complete" ? "sage" : tint} />
      <div>
        <p className="font-medium tracking-[-0.01em]">{pace.headline}</p>
        {pace.detail ? <p className="mt-0.5 text-sm text-ink/60">{pace.detail}</p> : null}
      </div>
    </Card>
  );
}
