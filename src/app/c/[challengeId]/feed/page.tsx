"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useChallenge } from "@/components/challenge/context";
import { Hero } from "@/components/challenge/hero";
import { CrewBooks } from "@/components/feed/crew-books";
import { ReadingFeed } from "@/components/feed/reading-feed";
import { PageSheet } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { greeting } from "@/lib/copy";
import { addDays, dayNumberOf, joinedDateFor } from "@/lib/domain/dates";
import { formatAmount } from "@/lib/domain/goals";
import { groupStatsOn, standingsReaders } from "@/lib/domain/history";
import type { DateKey } from "@/lib/domain/types";
import { formatDateKey } from "@/lib/format";
import { useNow } from "@/local/hooks";

function B({ children }: { children: ReactNode }) {
  return <span className="text-white">{children}</span>;
}

const dayButton = "grid size-8 place-items-center rounded-full bg-white/10 text-white/75 transition-colors hover:bg-white/20 disabled:opacity-30";

/**
 * Host only: step the hero back through earlier days of the challenge (to screenshot and share a
 * day's recap), forward again, or jump to any day with the date picker.
 */
function DayStepper({ day, isToday, first, last, onChange }: { day: DateKey; isToday: boolean; first: DateKey; last: DateKey; onChange: (d: DateKey) => void }) {
  return (
    <div className="mt-2 flex items-center justify-end gap-1.5" role="group" aria-label="Show another day">
      <button type="button" className={dayButton} aria-label="Previous day" disabled={day <= first} onClick={() => onChange(day > last ? last : addDays(day, -1))}>
        <Icon.chevron className="size-4 rotate-180" />
      </button>
      <span className="relative">
        <span className="flex h-8 items-center rounded-full bg-white/10 px-3 text-xs font-medium text-white/75">{isToday ? "Today" : "Pick day"}</span>
        <input
          type="date"
          aria-label="Pick a day"
          min={first}
          max={last}
          value={day > last ? last : day}
          onChange={(e) => {
            const v = e.target.value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= first && v <= last) onChange(v);
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </span>
      <button type="button" className={dayButton} aria-label="Next day" disabled={day >= last} onClick={() => onChange(addDays(day, 1))}>
        <Icon.chevron className="size-4" />
      </button>
    </div>
  );
}

/** Feed (reference: the black planner hero with a narrative summary sentence). */
export default function FeedPage() {
  const { view } = useChallenge();
  const now = useNow();
  const { me, challenge } = view;
  const first = me?.participant.displayName.split(" ")[0] ?? "reader";
  // The host can look back at earlier days; everyone else always sees today.
  const lastDay = view.today < challenge.endDate ? view.today : challenge.endDate;
  const [picked, setPicked] = useState<DateKey | null>(null);
  const day = view.isHost && picked && picked >= challenge.startDate && picked < view.today ? picked : view.today;
  const isToday = day === view.today;
  const pastStats = useMemo(
    () => (isToday ? null : groupStatsOn(challenge, standingsReaders(view.members, (p) => joinedDateFor(challenge, p)), day)),
    [isToday, challenge, view.members, day],
  );
  const stats = pastStats ?? view.stats;
  const parts = (["pages", "chapters", "minutes"] as const).filter((u) => stats.todayTotals[u] > 0).map((u) => formatAmount(stats.todayTotals[u], u));
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  const showStepper = view.isHost && view.today >= challenge.startDate;

  return (
    <>
      <Hero tone="dark" title="Feed" subtitle={challenge.name} back={{ href: `/c/${challenge.id}`, label: "Back to challenge" }} className="pb-16">
        <div className="px-5 pt-8">
          <div className="flex items-start justify-between">
            <p className="display flex items-start text-[88px] tabular text-white">
              {day.slice(8, 10)}
              <span className="ml-1 mt-3 size-3 rounded-full bg-signal" aria-hidden />
            </p>
            <div>
              <p className="pt-3 text-right text-[17px] leading-tight tracking-[-0.02em] text-white/45">
                {formatDateKey(day, { month: "short" })}&apos;{day.slice(2, 4)}
                <br />
                {formatDateKey(day, { weekday: "long" })}
              </p>
              {showStepper ? (
                <DayStepper
                  day={day}
                  isToday={isToday}
                  first={challenge.startDate}
                  last={lastDay}
                  onChange={(d) => setPicked(d >= view.today ? null : d)}
                />
              ) : null}
            </div>
          </div>
          {isToday ? (
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
          ) : (
            <p className="headline mt-6 text-[28px] leading-[1.18] text-white/45">
              <B>Day {dayNumberOf(challenge, day)} recap.</B>{" "}
              {joined ? (
                <>
                  Your crew read <B>{joined}</B>.{" "}
                </>
              ) : (
                <>No one read that day. </>
              )}
              <B>
                {stats.checkedInToday} of {stats.participantCount}
              </B>{" "}
              checked in.
            </p>
          )}
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
          {isToday ? (
            <div className="mt-5">
              <CrewBooks view={view} />
            </div>
          ) : (
            <button type="button" className="mt-5 rounded-pill bg-white/10 px-4 py-2.5 text-sm font-medium text-white/85" onClick={() => setPicked(null)}>
              Back to today
            </button>
          )}
        </div>
      </Hero>
      <PageSheet>
        <ReadingFeed view={view} />
      </PageSheet>
    </>
  );
}
