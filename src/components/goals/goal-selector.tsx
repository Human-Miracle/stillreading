"use client";
import { PRESET_DEFAULTS, describeGoal, goalFromPreset, type GoalPreset, type GoalPresetKind } from "@/lib/domain/goals";
import { PRESET_LIMITS } from "@/lib/validation/goal";
import { cn } from "../ui/cn";
import { Icon } from "../ui/icons";

const OPTIONS: { kind: GoalPresetKind; title: string; unit: string; per: string; tone: string }[] = [
  { kind: "every_day", title: "Read every day", unit: "", per: "", tone: "bg-butter" },
  { kind: "pages_per_day", title: "Pages", unit: "pages", per: "a day", tone: "bg-lavender" },
  { kind: "chapters_per_day", title: "Chapters", unit: "chapters", per: "a day", tone: "bg-sage" },
  { kind: "minutes_per_day", title: "Minutes", unit: "minutes", per: "a day", tone: "bg-blush" },
  { kind: "books", title: "Books", unit: "books", per: "this challenge", tone: "bg-sky" },
  { kind: "total_pages", title: "Total pages", unit: "pages", per: "this challenge", tone: "bg-butter" },
];

export function GoalSelector({ value, onChange, durationDays }: { value: GoalPreset; onChange: (v: GoalPreset) => void; durationDays: number }) {
  const limits = PRESET_LIMITS[value.kind];
  const current = OPTIONS.find((o) => o.kind === value.kind)!;
  const step = stepFor(value.kind);
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
                "relative min-h-[5.5rem] rounded-[1.25rem] p-4 text-left transition-all duration-200",
                active ? cn(o.tone, "scale-[1.01]") : "bg-surface shadow-soft hover:bg-white/70",
              )}
            >
              <span className="block text-[15px] font-medium tracking-[-0.01em]">{o.title}</span>
              <span className={cn("mt-1 block text-[13px] leading-snug", active ? "text-ink/65" : "text-muted")}>{example}</span>
              {active ? (
                <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-ink text-white">
                  <Icon.check className="size-3" strokeWidth={2.5} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {value.kind !== "every_day" ? (
        <div className="rounded-[1.5rem] bg-surface p-5 text-center shadow-soft">
          <label htmlFor="goal-amount" className="eyebrow">
            How many {current.unit} {current.per}?
          </label>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              aria-label="Decrease"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2 text-2xl disabled:opacity-30"
              disabled={value.value <= limits.min}
              onClick={() => onChange({ ...value, value: Math.max(limits.min, value.value - step) })}
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
              className="display tabular w-full min-w-0 flex-1 bg-transparent text-center text-[64px] focus:outline-none"
            />
            <button
              type="button"
              aria-label="Increase"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2 text-2xl disabled:opacity-30"
              disabled={value.value >= limits.max}
              onClick={() => onChange({ ...value, value: Math.min(limits.max, value.value + step) })}
            >
              +
            </button>
          </div>
          <p className="mt-2 text-sm text-muted">
            {value.value >= limits.min ? describeGoal(goalFromPreset(value, durationDays)) : "Choose an amount"}
            {value.kind.endsWith("_per_day") && value.value >= limits.min
              ? ` · ${goalFromPreset(value, durationDays).totalTarget.toLocaleString("en-US")} over ${durationDays} days`
              : ""}
          </p>
        </div>
      ) : (
        <p className="rounded-[1.5rem] bg-surface p-5 text-ink-2 shadow-soft">Any amount counts. Just show up and read a little every day.</p>
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
