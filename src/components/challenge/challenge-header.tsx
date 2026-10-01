"use client";
import Link from "next/link";
import type { ChallengeView } from "@/local/hooks";
import { SyncIndicator } from "../sync/sync-indicator";

export function ChallengeHeader({ view }: { view: ChallengeView }) {
  const { challenge } = view;
  const clock = view.me?.progress.clock;
  const sub =
    challenge.status === "archived"
      ? "Archived"
      : clock?.phase === "upcoming"
        ? `Starts in ${clock.startsInDays} day${clock.startsInDays === 1 ? "" : "s"}`
        : clock?.phase === "ended"
          ? "Challenge complete"
          : clock
            ? `Day ${clock.dayNumber} of ${challenge.durationDays}`
            : "";
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/95 backdrop-blur pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
        <Link href="/" className="grid size-10 shrink-0 place-items-center rounded-full font-display text-sm font-bold text-accent hover:bg-paper-2" aria-label="All challenges">
          SR
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold leading-tight">{challenge.name}</p>
          <p className="text-sm text-muted">{sub}</p>
        </div>
        <SyncIndicator />
        <Link href={`/c/${challenge.id}/settings`} className="grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-paper-2" aria-label="Challenge settings">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="5" cy="12" r="1.4" />
            <circle cx="12" cy="12" r="1.4" />
            <circle cx="19" cy="12" r="1.4" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
