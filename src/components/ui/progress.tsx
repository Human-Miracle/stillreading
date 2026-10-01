import { cn } from "./cn";

export type Tint = "butter" | "sage" | "blush" | "lavender" | "sky" | "ink";
const FILL: Record<Tint, string> = { butter: "bg-butter", sage: "bg-sage", blush: "bg-blush", lavender: "bg-lavender", sky: "bg-sky", ink: "bg-ink" };

export function ProgressBar({ value, label, tint = "butter", className }: { value: number; label: string; tint?: Tint; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("h-2 w-full overflow-hidden rounded-pill bg-surface-2", className)}
    >
      <div className={cn("h-full rounded-pill transition-[width] duration-700 ease-out", FILL[tint])} style={{ width: `${pct}%` }} />
    </div>
  );
}
