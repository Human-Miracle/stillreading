"use client";
import Link from "next/link";
import { DailyGoalCard } from "@/components/challenge/daily-goal-card";
import { GoalProgress } from "@/components/challenge/goal-progress";
import { useChallenge } from "@/components/challenge/context";
import { InviteActions } from "@/components/challenge/invite-actions";
import { ParticipantCard } from "@/components/people/participant-card";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Notice } from "@/components/ui/misc";
import { crewLine } from "@/lib/copy";
import { formatDateKey } from "@/lib/format";

export default function ChallengeHome() {
  const { view, openCheckIn } = useChallenge();
  const { me, challenge, stats } = view;
  if (!me) return null;
  const p = me.progress;
  const phase = challenge.status === "archived" ? "archived" : p.clock.phase;
  const crew = [...view.members].sort((a, b) => {
    if (a.participant.id === me.participant.id) return -1;
    if (b.participant.id === me.participant.id) return 1;
    return Number(b.progress.today.read) - Number(a.progress.today.read) || b.progress.streak.current - a.progress.streak.current;
  });
  const line = crewLine(stats, p.today.read);

  return (
    <div className="space-y-4">
      {phase === "ended" ? (
        <Card className="animate-rise bg-accent-soft/70 text-center">
          <p className="text-4xl" aria-hidden>
            🎉
          </p>
          <p className="mt-2 font-display text-2xl font-semibold">{challenge.name} is complete</p>
          <p className="mt-1 text-ink-2">
            You showed up for {p.readingDays} of {p.effectiveDuration} days.
          </p>
          <ButtonLink href={`/c/${challenge.id}/complete`} className="mt-4" full>
            See your recap
          </ButtonLink>
        </Card>
      ) : null}
      {phase === "archived" ? <Notice>This challenge has been archived. You can still view your final progress.</Notice> : null}
      {phase === "upcoming" ? (
        <Card className="text-center">
          <Eyebrow>Get ready</Eyebrow>
          <p className="mt-2 font-display text-3xl font-semibold">
            Starts in {p.clock.startsInDays} day{p.clock.startsInDays === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-ink-2">Day 1 is {formatDateKey(challenge.startDate, { weekday: "long", month: "long", day: "numeric" })}. Invite your crew while you wait.</p>
        </Card>
      ) : null}

      {phase === "active" && p.missedYesterday && !p.today.read ? (
        <Notice tone="warn">
          <span className="font-semibold">You missed yesterday. That&apos;s okay.</span> Start again today.
        </Notice>
      ) : null}
      {phase === "active" && p.missedYesterday && p.today.read && p.streak.current <= 1 ? <Notice tone="success">Welcome back. Nice work showing up today.</Notice> : null}

      {phase === "active" ? <DailyGoalCard me={me} onCheckIn={openCheckIn} canCheckIn /> : null}
      <GoalProgress me={me} />

      <InstallPrompt />

      {view.members.length <= 1 && phase !== "ended" && phase !== "archived" ? (
        <Card className="space-y-3">
          <p className="font-display text-xl font-semibold">Reading is better together</p>
          <p className="text-ink-2">Invite your friends. Everyone picks their own book and goal.</p>
          <InviteActions joinCode={challenge.joinCode} challengeName={challenge.name} challengeId={challenge.id} />
        </Card>
      ) : null}

      <section aria-labelledby="crew-title" className="space-y-3 pt-2">
        <div className="flex items-baseline justify-between">
          <h2 id="crew-title" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            Your reading crew
          </h2>
          <Link href={`/c/${challenge.id}/stats`} className="text-sm font-semibold text-accent">
            Challenge stats →
          </Link>
        </div>
        {line ? <p className="text-ink-2">{line}</p> : null}
        <ul className="space-y-2.5">
          {crew.map((m) => (
            <ParticipantCard key={m.participant.id} member={m} challengeId={challenge.id} isMe={m.participant.id === me.participant.id} />
          ))}
        </ul>
      </section>
    </div>
  );
}
