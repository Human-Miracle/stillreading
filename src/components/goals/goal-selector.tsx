"use client";
import { PRESET_DEFAULTS, describeGoal, goalFromPreset, type GoalPreset, type GoalPresetKind } from "@/lib/domain/goals";
import { PRESET_LIMITS } from "@/lib/validation/goal";
import { cn } from "../ui/cn";

const OPTIONS: { kind: GoalPresetKind; title: string; unit: string; per: string }[] = [
  { kind: "every_day", title: "Read every day", unit: "", per: "" },
  { kind: "pages_per_day", title: "Pages", unit: "pages", per: "a day" },
  { kind: "chapters_per_day", title: "Chapters", unit: "chapters", per: "a day" },
  { kind: "minutes_per_day", title: "Minutes", unit: "minutes", per: "a day" },
  { kind: "books", title: "Books", unit: "books", per: "this challenge" },
  { kind: "total_pages", title: "Total pages", unit: "pages", per: "this challenge" },
];

export function GoalSelector({ value, onChange, durationDays }: { value: GoalPreset; onChange: (v: GoalPreset) => void; durationDays: number }) {
  const limits = PRESET_LIMITS[value.kind];
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Goal type" className="grid grid-cols-2 gap-2.5">
        {OPTIONS.map((o) => {
          const active = o.kind === value.kind;
          const example = describeGoal(goalFromPreset({ kind: o.kind, value: PRESET_DEFAULTS[o.kind] }, durationDays));
          return (
            <button
              key={o.kind}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ kind: o.kind, value: o.kind === value.kind ? value.value : PRESET_DEFAULTS[o.kind] })}
              className={cn(
                "min-h-20 rounded-2xl border-2 p-3.5 text-left transition-colors",
                active ? "border-accent bg-accent-soft/50" : "border-line bg-card hover:border-muted/40",
              )}
            >
              <span className="block font-semibold">{o.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{example}</span>
            </button>
          );
        })}
      </div>

      {value.kind !== "every_day" ? (
        <div className="rounded-2xl bg-paper-2 p-4">
          <label htmlFor="goal-amount" className="block text-sm font-semibold text-ink-2">
            How many {OPTIONS.find((o) => o.kind === value.kind)?.unit} {OPTIONS.find((o) => o.kind === value.kind)?.per}?
          </label>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              aria-label="Decrease"
              className="grid size-12 place-items-center rounded-full bg-card text-2xl font-semibold shadow-card disabled:opacity-40"
              disabled={value.value <= limits.min}
              onClick={() => onChange({ ...value, value: Math.max(limits.min, value.value - stepFor(value.kind)) })}
            >
              −
            </button>
            <input
              id="goal-amount"
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(value.value)}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                onChange({ ...value, value: Number.isFinite(n) ? Math.min(limits.max, n) : 0 });
              }}
              className="tabular w-full min-w-0 flex-1 rounded-field border border-line bg-card py-2 text-center font-display text-4xl font-semibold"
            />
            <button
              type="button"
              aria-label="Increase"
              className="grid size-12 place-items-center rounded-full bg-card text-2xl font-semibold shadow-card disabled:opacity-40"
              disabled={value.value >= limits.max}
              onClick={() => onChange({ ...value, value: Math.min(limits.max, value.value + stepFor(value.kind)) })}
            >
              +
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">
            {value.value >= limits.min ? describeGoal(goalFromPreset(value, durationDays)) : "Choose an amount"}
            {value.kind.endsWith("_per_day") && value.value >= limits.min
              ? ` · ${goalFromPreset(value, durationDays).totalTarget.toLocaleString("en-US")} over ${durationDays} days`
              : ""}
          </p>
        </div>
      ) : (
        <p className="rounded-2xl bg-paper-2 p-4 text-sm text-ink-2">Any amount counts. Just show up and read a little every day.</p>
      )}
    </div>
  );
}

function stepFor(kind: GoalPresetKind) {
  if (kind === "total_pages") return 50;
  if (kind === "pages_per_day" || kind === "minutes_per_day") return 5;
  return 1;
}

export function isGoalValid(goal: GoalPreset) {
  const l = PRESET_LIMITS[goal.kind];
  return goal.value >= l.min && goal.value <= l.max;
}
