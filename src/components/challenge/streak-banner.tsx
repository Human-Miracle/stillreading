import { cn } from "../ui/cn";
import { Icon } from "../ui/icons";

export function StreakBanner({ title, sub, className }: { title: string; sub: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Icon.streak className="h-6 w-8 shrink-0 text-ink" />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium tracking-[-0.02em]">{title}</p>
        <p className="truncate text-sm text-ink/55">{sub}</p>
      </div>
    </div>
  );
}
