"use client";
import { cn } from "./cn";

/** Pill segmented control (reference: "Trainings · Statistic · Challenges"). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  tone = "light",
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  tone?: "light" | "glass";
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex rounded-pill p-1", tone === "glass" ? "bg-white/40 backdrop-blur-md" : "bg-surface-2")}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-10 flex-1 rounded-pill px-3 text-sm font-medium transition-all duration-200",
              active ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Text tabs with count badges (reference: "All 23 · Design 10 · Fantasy 5"). */
export function CountTabs<T extends string>({
  label,
  value,
  tabs,
  onChange,
}: {
  label: string;
  value: T;
  tabs: { value: T; label: string; count: number }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar -mx-5 flex gap-6 overflow-x-auto px-5">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn("flex shrink-0 items-center gap-1.5 py-2 text-[17px] tracking-[-0.02em] transition-colors", active ? "text-ink" : "text-ink/45 hover:text-ink/70")}
          >
            {t.label}
            <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-medium tabular", active ? "bg-ink text-white" : "bg-ink/8 text-ink/50")}>
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
