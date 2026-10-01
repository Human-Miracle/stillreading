"use client";
import Link from "next/link";
import { useChallenge } from "@/components/challenge/context";
import { ChallengeStats } from "@/components/challenge/challenge-stats";
import { InviteActions } from "@/components/challenge/invite-actions";
import { Avatar } from "@/components/ui/avatar";
import { Card, Eyebrow } from "@/components/ui/card";
import { amountSummary } from "@/lib/copy";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card pad="sm">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1 font-display text-3xl font-semibold tabular">{value}</p>
      {sub ? <p className="text-sm text-muted">{sub}</p> : null}
    </Card>
  );
}

export default function StatsPage() {
  const { view } = useChallenge();
  const { stats, challenge } = view;
  const clock = view.me?.progress.clock;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-semibold">{challenge.name}</h1>
        {clock ? (
          <p className="text-muted">
            {clock.phase === "ended" ? "Complete" : clock.phase === "upcoming" ? "Not started yet" : `Day ${clock.dayNumber} / ${challenge.durationDays}`}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Participants" value={String(stats.participantCount)} />
        <Stat label="Checked in today" value={String(stats.checkedInToday)} sub={`${stats.participationToday}% participation`} />
        <Stat label="Avg consistency" value={`${stats.averageConsistency}%`} />
        <Stat label="Longest streak" value={`${stats.longestStreak}`} sub={`day${stats.longestStreak === 1 ? "" : "s"}`} />
      </div>
      <Card>
        <Eyebrow>Total reading</Eyebrow>
        <p className="mt-1 font-display text-2xl font-semibold tabular">{amountSummary(stats.totals)}</p>
        {stats.booksCompleted ? (
          <p className="text-sm text-muted">
            {stats.booksCompleted} book{stats.booksCompleted === 1 ? "" : "s"} finished
          </p>
        ) : null}
        {stats.peopleOnSevenPlusStreak ? (
          <p className="mt-2 text-ink-2">
            {stats.peopleOnSevenPlusStreak} {stats.peopleOnSevenPlusStreak === 1 ? "person is" : "people are"} on a 7+ day streak. 🔥
          </p>
        ) : null}
      </Card>

      <ChallengeStats stats={stats} />

      <Link href={`/c/${challenge.id}/leaderboard`} className="block rounded-card bg-black px-5 py-4 text-white">
        <span className="flex items-center justify-between gap-3">
          <span>
            <span className="block font-display text-xl font-medium">See the leaderboard</span>
            <span className="block text-sm text-white/80">Top readers by XP across every stat</span>
          </span>
          <span className="flex gap-1" aria-hidden>
            {["#FE6237", "#FFB62E", "#7CC3FF", "#4164FF"].map((c) => (
              <span key={c} className="size-3 rounded-sm" style={{ background: c }} />
            ))}
          </span>
        </span>
      </Link>

      <Card>
        <Eyebrow className="mb-2">Participation</Eyebrow>
        <ul className="divide-y divide-line">
          {[...view.members]
            .sort((a, b) => b.progress.goalDays - a.progress.goalDays || a.participant.displayName.localeCompare(b.participant.displayName))
            .map((m) => (
              <li key={m.participant.id}>
                <Link href={`/c/${challenge.id}/people/${m.participant.id}`} className="flex items-center gap-3 py-2.5">
                  <Avatar name={m.participant.displayName} id={m.participant.id} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-medium">{m.participant.displayName}</span>
                  <span className="tabular text-sm text-ink-2">
                    {m.progress.goalDays}/{m.progress.days.length} days
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </Card>

      {view.isHost ? (
        <Card className="space-y-3">
          <Eyebrow>Invite more readers</Eyebrow>
          <InviteActions joinCode={challenge.joinCode} challengeName={challenge.name} challengeId={challenge.id} />
        </Card>
      ) : null}
    </div>
  );
}
