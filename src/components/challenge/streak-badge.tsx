import { cn } from "../ui/cn";

export function StreakBadge({ days, size = "md" }: { days: number; size?: "sm" | "md" }) {
  if (days <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill bg-accent-soft font-semibold text-streak tabular",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
      )}
      aria-label={`${days} day streak`}
    >
      <span aria-hidden>🔥</span>
      {days} day{days === 1 ? "" : "s"}
    </span>
  );
}
