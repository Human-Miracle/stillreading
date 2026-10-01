"use client";
import type { ReactNode } from "react";
import { useChallenge } from "@/components/challenge/context";
import { Hero } from "@/components/challenge/hero";
import { CrewBooks } from "@/components/feed/crew-books";
import { ReadingFeed } from "@/components/feed/reading-feed";
import { PageSheet } from "@/components/ui/card";
import { greeting } from "@/lib/copy";
import { formatAmount } from "@/lib/domain/goals";
import { formatDateKey } from "@/lib/format";
import { useNow } from "@/local/hooks";

function B({ children }: { children: ReactNode }) {
  return <span className="text-white">{children}</span>;
}

/** Feed (reference: the black planner hero with a narrative summary sentence). */
export default function FeedPage() {
  const { view } = useChallenge();
  const now = useNow();
  const { stats, me, challenge } = view;
  const first = me?.participant.displayName.split(" ")[0] ?? "reader";
  const parts = (["pages", "chapters", "minutes"] as const).filter((u) => stats.todayTotals[u] > 0).map((u) => formatAmount(stats.todayTotals[u], u));
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];

  return (
    <>
      <Hero tone="dark" title="Feed" subtitle={challenge.name} back={{ href: `/c/${challenge.id}`, label: "Back to challenge" }} className="pb-16">
        <div className="px-5 pt-8">
          <div className="flex items-start justify-between">
            <p className="display flex items-start text-[88px] tabular text-white">
              {view.today.slice(8, 10)}
              <span className="ml-1 mt-3 size-3 rounded-full bg-signal" aria-hidden />
            </p>
            <p className="pt-3 text-right text-[17px] leading-tight tracking-[-0.02em] text-white/45">
              {formatDateKey(view.today, { month: "short" })}&apos;{view.today.slice(2, 4)}
              <br />
              {formatDateKey(view.today, { weekday: "long" })}
            </p>
          </div>
          <p className="headline mt-6 text-[28px] leading-[1.18] text-white/45">
            {greeting(now)}, <B>{first}.</B>{" "}
            {joined ? (
              <>
                Your crew has read <B>{joined}</B> today.{" "}
              </>
            ) : (
              <>No one has read yet today. </>
            )}
            <B>
              {stats.checkedInToday} of {stats.participantCount}
            </B>{" "}
            {stats.checkedInToday === 1 ? "has" : "have"} checked in.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80">
            <span>
              <span className="text-butter">●</span> {stats.totals.pages.toLocaleString("en-US")} pages total
            </span>
            <span>
              <span className="text-blush">●</span> {stats.longestStreak}-day best streak
            </span>
            <span>
              <span className="text-sage">●</span> {stats.averageConsistency}% consistency
            </span>
          </div>
          <div className="mt-5">
            <CrewBooks view={view} />
          </div>
        </div>
      </Hero>
      <PageSheet>
        <ReadingFeed view={view} />
      </PageSheet>
    </>
  );
}
