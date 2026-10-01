"use client";
import Link from "next/link";
import { useState } from "react";
import { useChallenge } from "@/components/challenge/context";
import { Hero } from "@/components/challenge/hero";
import { InviteActions } from "@/components/challenge/invite-actions";
import { Avatar, tintFor } from "@/components/ui/avatar";
import { Card, Eyebrow, PageSheet } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { amountSummary } from "@/lib/copy";
import type { Leader } from "@/lib/domain/stats";
import { n } from "@/lib/format";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/45 px-3 py-4 text-center backdrop-blur-md">
      <p className="text-xs text-ink/55">{label}</p>
      <p className="mt-1 text-xl font-medium tracking-[-0.03em] tabular">{value}</p>
    </div>
  );
}

/** Leader card (reference: the "Time asleep / Sleep quality" tiles with a gradient scale). */
function LeaderCard({ title, leader, unit, max }: { title: string; leader: Leader | null; unit: string; max: number }) {
  if (!leader) return null;
  const pos = max > 0 ? Math.min(100, (leader.value / max) * 100) : 0;
  return (
    <Card tone="muted" pad="sm" className="flex flex-col">
      <p className="text-sm font-medium tracking-[-0.01em]">{title}</p>
      <p className="mt-2 text-[30px] font-medium tracking-[-0.04em] tabular">
        {n(leader.value)}
        <span className="ml-1 text-sm tracking-normal text-muted">{unit}</span>
      </p>
      <div className="relative mt-3 h-2 rounded-pill bg-white">
        <div className="absolute inset-y-0 left-0 rounded-pill bg-[linear-gradient(90deg,#f5c08a,#bdd3f4)]" style={{ width: `${Math.max(pos, 12)}%` }} />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <span className={`size-2 rounded-full bg-${tintFor(leader.participantId)}`} aria-hidden />
        {leader.displayName}
      </p>
    </Card>
  );
}

export default function StatsPage() {
  const { view } = useChallenge();
  const { stats, challenge } = view;
  const [tab, setTab] = useState<"leaders" | "participation">("leaders");
  const clock = view.me?.progress.clock;
  const headline = stats.totals.pages ? { v: stats.totals.pages, l: "pages read together" } : stats.totals.minutes ? { v: stats.totals.minutes, l: "minutes read together" } : { v: stats.totals.chapters, l: "chapters read together" };
  const L = stats.leaders;

  return (
    <>
      <Hero
        tone="honey"
        title="Challenge stats"
        subtitle={clock?.phase === "ended" ? "Complete" : clock?.phase === "upcoming" ? "Not started yet" : `Day ${clock?.dayNumber} of ${challenge.durationDays}`}
        back={{ href: `/c/${challenge.id}`, label: "Back to challenge" }}
        className="pb-12"
      >
        <div className="px-5 pt-10 text-center">
          <p className="display text-[104px] tabular text-white" aria-label={`${n(headline.v)} ${headline.l}`}>
            {n(headline.v)}
          </p>
          <p className="mt-2 font-medium text-white/90">{headline.l}</p>
          <div className="mt-8 grid grid-cols-3 gap-2.5">
            <Tile label="Participants" value={String(stats.participantCount)} />
            <Tile label="Checked in" value={`${stats.checkedInToday} · ${stats.participationToday}%`} />
            <Tile label="Consistency" value={`${stats.averageConsistency}%`} />
          </div>
        </div>
      </Hero>

      <PageSheet className="space-y-5">
        <div>
          <h2 className="headline text-[26px]">Together</h2>
          <p className="mt-1 text-ink/60">
            {amountSummary(stats.totals)}
            {stats.booksCompleted ? ` · ${stats.booksCompleted} book${stats.booksCompleted === 1 ? "" : "s"} finished` : ""}
            {stats.peopleOnSevenPlusStreak ? ` · ${stats.peopleOnSevenPlusStreak} on a 7+ day streak` : ""}
          </p>
        </div>
        <Segmented
          label="Stats view"
          value={tab}
          onChange={setTab}
          options={[
            { value: "leaders", label: "Leaders" },
            { value: "participation", label: "Participation" },
          ]}
        />

        {tab === "leaders" ? (
          Object.values(L).some(Boolean) ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <LeaderCard title="Longest streak" leader={L.currentStreak} unit="days" max={challenge.durationDays} />
                <LeaderCard title="Most consistent" leader={L.mostConsistent} unit="%" max={100} />
                <LeaderCard title="Most pages" leader={L.mostPages} unit="pages" max={stats.totals.pages} />
                <LeaderCard title="Most minutes" leader={L.mostMinutes} unit="min" max={stats.totals.minutes} />
                <LeaderCard title="Most chapters" leader={L.mostChapters} unit="ch." max={stats.totals.chapters} />
                <LeaderCard title="Books completed" leader={L.booksCompleted} unit="books" max={Math.max(stats.booksCompleted, 1)} />
              </div>
              <p className="text-xs text-muted">Pages, chapters and minutes are never mixed into one score. Everyone&apos;s goal is different.</p>
            </>
          ) : (
            <p className="rounded-card bg-surface-2 p-5 text-ink/60">Leaders appear after the first check-ins. 📚</p>
          )
        ) : (
          <ul>
            {[...view.members]
              .sort((a, b) => b.progress.goalDays - a.progress.goalDays || a.participant.displayName.localeCompare(b.participant.displayName))
              .map((m) => (
                <li key={m.participant.id} className="dotted">
                  <Link href={`/c/${challenge.id}/people/${m.participant.id}`} className="flex items-center gap-3 py-3.5">
                    <Avatar name={m.participant.displayName} id={m.participant.id} size="sm" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="truncate text-[15px] font-medium">{m.participant.displayName}</p>
                      <ProgressBar value={m.progress.days.length ? (m.progress.goalDays / m.progress.days.length) * 100 : 0} label={`${m.participant.displayName} goal days`} tint={tintFor(m.participant.id)} />
                    </div>
                    <span className="w-20 text-right text-sm tabular text-ink/70">
                      {m.progress.goalDays}/{m.progress.days.length} days
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        )}

        {view.isHost ? (
          <Card tone="muted" className="space-y-3">
            <Eyebrow>Invite more readers</Eyebrow>
            <InviteActions joinCode={challenge.joinCode} challengeName={challenge.name} challengeId={challenge.id} />
          </Card>
        ) : null}
      </PageSheet>
    </>
  );
}
