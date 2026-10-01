import type { ParticipantProgress } from "@/lib/domain/progress";
import { amountSummary } from "@/lib/copy";
import { formatDateKey } from "@/lib/format";
import { dayStates } from "../challenge/day-ring";
import { cn } from "../ui/cn";

const WEEK = ["bg-butter", "bg-sage", "bg-blush", "bg-lavender", "bg-sky"];
const WEEK_SOFT = ["bg-butter/45", "bg-sage/45", "bg-blush/45", "bg-lavender/45", "bg-sky/45"];

/** Calendar of challenge days in the ring's weekly pastel colours. Text, not colour alone, carries state. */
export function DayGrid({ progress, durationDays }: { progress: ParticipantProgress; durationDays: number }) {
  const states = dayStates(progress, durationDays);
  const offset = durationDays - progress.effectiveDuration;
  return (
    <div>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="Challenge days">
        {states.map((state, i) => {
          const d = i >= offset ? progress.days[i - offset] : undefined;
          const week = Math.floor(i / 7) % WEEK.length;
          const label =
            state === "before"
              ? `Day ${i + 1}: before joining`
              : d
                ? `Day ${i + 1}, ${formatDateKey(d.date)}: ${state === "met" ? "goal met" : state === "read" ? `read ${amountSummary(d.totals)}` : state === "today" ? "today, not yet" : "no reading"}`
                : `Day ${i + 1}: upcoming`;
          return (
            <li
              key={i}
              aria-label={label}
              title={label}
              className={cn(
                "grid aspect-square place-items-center rounded-xl text-[11px] font-medium tabular",
                state === "met" && cn(WEEK[week], "text-ink"),
                state === "read" && cn(WEEK_SOFT[week], "text-ink/70"),
                state === "missed" && "bg-surface-2 text-ink/35",
                state === "today" && "border border-dashed border-signal text-signal",
                state === "future" && "border border-line text-ink/30",
                state === "before" && "text-ink/20",
              )}
            >
              {state === "met" ? "✓" : i + 1}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>✓ goal met</span>
        <span>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-butter/45 align-middle" />
          read
        </span>
        <span>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-surface-2 align-middle" />
          no reading
        </span>
      </p>
    </div>
  );
}
