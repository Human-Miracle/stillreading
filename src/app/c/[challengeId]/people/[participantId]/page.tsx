"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useChallenge } from "@/components/challenge/context";
import { GoalProgress } from "@/components/challenge/goal-progress";
import { StreakBadge } from "@/components/challenge/streak-badge";
import { ReadingFeedItem } from "@/components/feed/reading-feed";
import { DayGrid } from "@/components/people/day-grid";
import { Avatar } from "@/components/ui/avatar";
import { Card, Eyebrow } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { amountSummary } from "@/lib/copy";

export default function ParticipantPage() {
  const { participantId } = useParams<{ participantId: string }>();
  const { view } = useChallenge();
  const member = view.members.find((m) => m.participant.id === participantId);
  if (!member) {
    return (
      <EmptyState title="This reader isn't in the challenge anymore" icon="👋">
        <Link href={`/c/${view.challenge.id}/people`} className="font-semibold text-accent">
          Back to people
        </Link>
      </EmptyState>
    );
  }
  const p = member.progress;
  const recent = view.feed.filter((s) => s.participantId === participantId).slice(0, 10);

  return (
    <div className="space-y-4">
      <Link href={`/c/${view.challenge.id}/people`} className="text-sm font-semibold text-muted">
        ← People
      </Link>
      <header className="flex items-center gap-4">
        <Avatar name={member.participant.displayName} id={member.participant.id} size="lg" />
        <div>
          <h1 className="font-display text-3xl font-semibold">{member.participant.displayName}</h1>
          <div className="mt-1">
            {p.streak.current > 0 ? <StreakBadge days={p.streak.current} /> : <span className="text-sm text-muted">No streak right now</span>}
          </div>
        </div>
      </header>

      <Card className="space-y-1">
        <Eyebrow>Reading now</Eyebrow>
        <p className="font-display text-xl font-semibold">{member.currentBook?.title ?? "No book yet"}</p>
        {member.currentBook?.author ? <p className="text-sm text-muted">{member.currentBook.author}</p> : null}
        <p className="pt-2 text-ink-2">{p.today.read ? `${amountSummary(p.today.totals)} today` : "Hasn't checked in yet today"}</p>
      </Card>

      <GoalProgress me={member} title="Goal" />

      <div className="grid grid-cols-2 gap-3">
        <Card pad="sm">
          <Eyebrow>Reading days</Eyebrow>
          <p className="mt-1 font-display text-3xl font-semibold tabular">
            {p.readingDays}
            <span className="text-lg text-muted"> / {p.days.length}</span>
          </p>
        </Card>
        <Card pad="sm">
          <Eyebrow>Longest streak</Eyebrow>
          <p className="mt-1 font-display text-3xl font-semibold tabular">
            {p.streak.longest}
            <span className="text-lg text-muted"> day{p.streak.longest === 1 ? "" : "s"}</span>
          </p>
        </Card>
      </div>

      <Card>
        <Eyebrow className="mb-3">Challenge days</Eyebrow>
        <DayGrid progress={p} durationDays={view.challenge.durationDays} />
      </Card>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Recent reading</h2>
        {recent.length ? (
          <ul className="space-y-3">
            {recent.map((s) => (
              <ReadingFeedItem key={s.id} view={view} session={s} />
            ))}
          </ul>
        ) : (
          <EmptyState title="No check-ins yet" />
        )}
      </section>
    </div>
  );
}
