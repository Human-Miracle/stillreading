import type { ReactNode } from "react";
import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-card bg-ink/5", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4 px-5 pt-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="mx-auto size-64 rounded-full" />
      <Skeleton className="h-24" />
      <Skeleton className="h-40" />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-card bg-surface-2 px-6 py-10 text-center">
      <p className="headline text-xl">{title}</p>
      {children ? <div className="mt-2 text-muted">{children}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "success" | "danger"; children: ReactNode; className?: string }) {
  const tones = {
    info: "bg-surface-2 text-ink-2",
    warn: "bg-butter/60 text-ink",
    success: "bg-sage/40 text-ink",
    danger: "bg-[#ffe7e3] text-ink",
  };
  return <div className={cn("rounded-2xl px-4 py-3.5 text-sm leading-relaxed", tones[tone], className)}>{children}</div>;
}

/** The brand mark: a segmented pastel ring, echoing the challenge-day ring. */
export function BrandMark({ className }: { className?: string }) {
  const arcs = [
    { from: -80, to: 10, c: "var(--butter)" },
    { from: 26, to: 116, c: "var(--sage)" },
    { from: 132, to: 222, c: "var(--blush)" },
    { from: 238, to: 268, c: "var(--lavender)" },
  ];
  const r = 9;
  const pt = (deg: number) => [12 + r * Math.cos((deg * Math.PI) / 180), 12 + r * Math.sin((deg * Math.PI) / 180)];
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden>
      {arcs.map((a) => {
        const [x1, y1] = pt(a.from);
        const [x2, y2] = pt(a.to);
        return <path key={a.from} d={`M${x1} ${y1} A${r} ${r} 0 ${a.to - a.from > 180 ? 1 : 0} 1 ${x2} ${y2}`} stroke={a.c} strokeWidth="4.6" strokeLinecap="round" fill="none" />;
      })}
      <circle cx="12" cy="12" r="1.8" fill="var(--signal)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-medium tracking-[-0.04em]", className)}>
      <BrandMark className="size-[1.15em]" />
      Still Reading
    </span>
  );
}
