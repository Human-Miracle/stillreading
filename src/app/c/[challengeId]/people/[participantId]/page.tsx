"use client";
import { useParams } from "next/navigation";
import { useChallenge } from "@/components/challenge/context";
import { DayRing } from "@/components/challenge/day-ring";
import { GoalProgress } from "@/components/challenge/goal-progress";
import { Hero, type HeroTone } from "@/components/challenge/hero";
import { StreakBanner } from "@/components/challenge/streak-banner";
import { ReadingFeed } from "@/components/feed/reading-feed";
import { Avatar, tintFor } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow, PageSheet } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { amountSummary, streakBanner } from "@/lib/copy";

const HERO_FOR: Record<string, HeroTone> = { butter: "honey", sage: "sky", blush: "blush", lavender: "lavender", sky: "sky" };

export default function ParticipantPage() {
  const { participantId } = useParams<{ participantId: string }>();
  const { view } = useChallenge();
  const member = view.members.find((m) => m.participant.id === participantId);
  const back = { href: `/c/${view.challenge.id}/people`, label: "Back to people" };
  if (!member) {
    return (
      <>
        <Hero tone="paper" title="Reader" back={back} />
        <div className="px-5 pt-8">
          <EmptyState title="This reader isn't in the challenge anymore">
            <ButtonLink href={back.href} size="sm" className="mt-3">
              Back to people
            </ButtonLink>
          </EmptyState>
        </div>
      </>
    );
  }
  const p = member.progress;
  const isMe = member.participant.id === view.challenge.myParticipantId;
  const others = view.members.filter((m) => m !== member).map((m) => m.progress.streak.current);
  const banner = streakBanner(p, others, view.challenge.durationDays);
  const sessions = view.feed.filter((s) => s.participantId === participantId);

  return (
    <>
      <Hero tone={HERO_FOR[tintFor(member.participant.id)] ?? "lavender"} title={member.participant.displayName} subtitle={isMe ? "You" : view.challenge.name} back={back} className="pb-14">
        <div className="px-5 pt-6">
          <div className="flex items-center gap-4">
            <Avatar name={member.participant.displayName} id={member.participant.id} size="xl" className="ring-4 ring-white/60" />
            <div className="min-w-0">
              <h1 className="display truncate text-[44px]">{member.participant.displayName}</h1>
              <p className="mt-1 truncate text-ink/60">{member.currentBook ? `Reading ${member.currentBook.title}` : "No book yet"}</p>
            </div>
          </div>
          <StreakBanner className="mt-6" title={
              isMe
                ? banner.title
                : p.streak.current >= 2
                  ? `${p.streak.current} days without a break`
                  : p.streak.current === 1
                    ? "Day one of a new streak"
                    : "No streak right now"
            } sub={isMe ? banner.sub : p.today.read ? `${amountSummary(p.today.totals)} today` : "Hasn't checked in yet today"} />
          <div className="pt-4">
            <DayRing progress={p} durationDays={view.challenge.durationDays} size={280}>
              <div>
                <p className="display text-[72px] tabular">{p.readingDays}</p>
                <p className="mt-1 text-sm text-ink/55">reading days of {p.days.length}</p>
              </div>
            </DayRing>
          </div>
        </div>
      </Hero>
      <PageSheet className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Card tone="muted" pad="sm">
            <Eyebrow>Longest streak</Eyebrow>
            <p className="display mt-2 text-[40px] tabular">{p.streak.longest}</p>
            <p className="text-xs text-muted">day{p.streak.longest === 1 ? "" : "s"}</p>
          </Card>
          <Card tone="muted" pad="sm">
            <Eyebrow>Consistency</Eyebrow>
            <p className="display mt-2 text-[40px] tabular">{p.consistency.display}%</p>
            <p className="text-xs text-muted">{p.goalDays} goal days</p>
          </Card>
        </div>
        <GoalProgress me={member} title="Goal" tint={tintFor(member.participant.id)} />
        <div className="pt-2">
          <h2 className="headline mb-1 text-[22px]">Recent reading</h2>
          {sessions.length ? <ReadingFeed view={view} sessions={sessions.slice(0, 20)} showEmpty={false} /> : <EmptyState title="No check-ins yet" />}
        </div>
      </PageSheet>
    </>
  );
}
