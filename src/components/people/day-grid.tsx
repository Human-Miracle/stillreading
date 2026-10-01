import type { ParticipantProgress } from "@/lib/domain/progress";
import { amountSummary } from "@/lib/copy";
import { formatDateKey } from "@/lib/format";
import { cn } from "../ui/cn";

/** One cell per challenge day: goal met, read, missed, today, future. Shape + text, not colour alone. */
export function DayGrid({ progress, durationDays }: { progress: ParticipantProgress; durationDays: number }) {
  const offset = durationDays - progress.effectiveDuration;
  const cells = Array.from({ length: durationDays }, (_, i) => (i < offset ? undefined : (progress.days[i - offset] ?? null)));
  return (
    <div>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="Challenge days">
        {cells.map((d, i) => {
          const isToday = d?.date === progress.clock.today && progress.clock.phase === "active";
          const state = d === undefined ? "before" : !d ? "future" : d.goalMet ? "met" : d.read ? "read" : isToday ? "today" : "missed";
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
                "grid aspect-square place-items-center rounded-lg text-xs font-semibold tabular",
                state === "met" && "bg-success text-white",
                state === "read" && "bg-success-soft text-success",
                state === "missed" && "bg-paper-2 text-muted",
                state === "today" && "border-2 border-dashed border-accent text-accent",
                state === "future" && "border border-line text-muted/60",
                state === "before" && "text-muted/40",
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
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-success-soft align-middle" />
          read
        </span>
        <span>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-paper-2 align-middle" />
          no reading
        </span>
      </p>
    </div>
  );
}
