import type { ReactNode } from "react";
import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-card bg-paper-2", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-36" />
      <Skeleton className="h-24" />
      <Skeleton className="h-48" />
    </div>
  );
}

export function EmptyState({ title, children, icon = "📚" }: { title: string; children?: ReactNode; icon?: string }) {
  return (
    <div className="rounded-card border border-dashed border-line px-6 py-10 text-center">
      <div className="mb-2 text-3xl" aria-hidden>
        {icon}
      </div>
      <p className="font-display text-xl font-semibold">{title}</p>
      {children ? <div className="mt-2 text-muted">{children}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "success" | "danger"; children: ReactNode; className?: string }) {
  const tones = {
    info: "bg-paper-2 text-ink-2",
    warn: "bg-warn-soft text-ink",
    success: "bg-success-soft text-ink",
    danger: "bg-danger-soft text-ink",
  };
  return <div className={cn("rounded-2xl px-4 py-3 text-sm leading-relaxed", tones[tone], className)}>{children}</div>;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-bold tracking-tight", className)}>
      READ<span className="text-accent">30</span>
    </span>
  );
}
