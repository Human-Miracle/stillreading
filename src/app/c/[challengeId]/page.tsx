"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useChallenge } from "@/components/challenge/context";
import { DayOneBanner } from "@/components/challenge/day-one";
import { DayRing } from "@/components/challenge/day-ring";
import { Hero } from "@/components/challenge/hero";
import { InviteActions } from "@/components/challenge/invite-actions";
import { StreakBanner } from "@/components/challenge/streak-banner";
import { CrewList } from "@/components/people/crew-list";
import { PassPrompt } from "@/components/pass/pass-prompt";
import { Button, ButtonLink, IconButton, IconLink } from "@/components/ui/button";
import { Card, PageSheet } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { crewLine, streakBanner } from "@/lib/copy";
import { formatAmount, unitLabel } from "@/lib/domain/goals";
import { formatDateKey } from "@/lib/format";
import { shareInvite } from "@/lib/invite";
import type { ChallengeView, MemberView } from "@/local/hooks";

/** Emphasis inside the coach card: bold ink reads clearly on every stop of the sunrise gradient. */
function Hl({ children }: { children: ReactNode; tone?: "signal" | "good" }) {
  return <span className="font-semibold">{children}</span>;
}

/** Pastel assistant-style card (reference: the pink "Intelly assistant" card). */
function CoachCard({ view, me }: { view: ChallengeView; me: MemberView }) {
  const { challenge } = view;
  const p = me.progress;
  const g = p.goal;
  const goal = me.goal;
  const first = me.participant.displayName.split(" ")[0];
  let label = "Pace check";
  let body: ReactNode = null;
  let action: ReactNode = null;

  if (challenge.status === "archived") {
    label = "Archived";
    body = "This challenge has been archived. You can still view your final progress.";
  } else if (p.clock.phase === "ended") {
    label = "Challenge complete";
    body = (
      <>
        {challenge.name} is complete. You showed up for <Hl tone="good">{p.readingDays} of {p.effectiveDuration} days</Hl>.
      </>
    );
    action = (
      <ButtonLink href={`/c/${challenge.id}/complete`} size="sm">
        See your recap
      </ButtonLink>
    );
  } else if (p.clock.phase === "upcoming") {
    label = "Get ready";
    body = `Day 1 is ${formatDateKey(challenge.startDate, { weekday: "long", month: "long", day: "numeric" })}. Invite your crew while you wait.`;
  } else if (g && goal) {
    const u = goal.targetUnit;
    const pace = g.pace;
    if (pace.status === "complete") body = <>Goal reached. Anything more is a bonus. 🎉</>;
    else if (pace.status === "ahead") body = <>{first}, you&apos;re <Hl tone="good">{formatAmount(pace.aheadBy, u)}</Hl> ahead of pace. Keep going.</>;
    else if (pace.status === "on_track") body = <>{first}, you&apos;re right on pace. Keep showing up.</>;
    else if (pace.requiredDailyAverage === null) body = <><Hl>{formatAmount(pace.remaining, u)}</Hl> to go on the last day. You can still make it.</>;
    else
      body = (
        <>
          {first}, you&apos;re <Hl>{formatAmount(pace.behindBy, u)}</Hl> behind your original pace. About {formatAmount(pace.requiredDailyAverage, u)} a day gets you there.
        </>
      );
    action = (
      <ButtonLink href={`/c/${challenge.id}/me`} size="sm">
        Your progress
      </ButtonLink>
    );
  }
  if (!body) return null;
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(110deg,#f2cb67_0%,#efab5c_52%,#d98a5c_100%)] px-5 pb-5 pt-4">
      <svg viewBox="0 0 100 90" className="pointer-events-none absolute -bottom-6 right-2 h-28 w-32 text-white/25" aria-hidden>
        <path fill="currentColor" d="M50 88S2 60 2 28A24 24 0 0 1 50 16a24 24 0 0 1 48 12c0 32-48 60-48 60z" />
      </svg>
      <p className="eyebrow text-ink/60">{label}</p>
      <p className="relative mt-1.5 max-w-[30ch] text-[17px] leading-snug tracking-[-0.015em]">{body}</p>
      {action ? <div className="relative mt-4">{action}</div> : null}
    </section>
  );
}

export default function ChallengeHome() {
  const { view, openCheckIn, openDayOneCheckIn } = useChallenge();
  const { me, challenge, stats } = view;
  const [shared, setShared] = useState(false);
  if (!me) return null;
  const p = me.progress;
  const phase = challenge.status === "archived" ? "archived" : p.clock.phase;
  const crewStreaks = view.members.filter((m) => m !== me).map((m) => m.progress.streak.current);
  const banner = streakBanner(p, crewStreaks, view.challenge.durationDays);
  const crew = [...view.members].sort((a, b) => {
    if (a === me) return -1;
    if (b === me) return 1;
    return Number(b.progress.today.read) - Number(a.progress.today.read) || b.progress.streak.current - a.progress.streak.current;
  });
  const line = crewLine(stats, p.today.read);
  const unit = me.goal?.targetUnit ?? "pages";

  let big: string;
  let caption: string;
  if (phase === "upcoming") {
    big = String(p.clock.startsInDays);
    caption = `day${p.clock.startsInDays === 1 ? "" : "s"} to go`;
  } else if (phase === "ended" || phase === "archived") {
    big = String(p.readingDays);
    caption = `day${p.readingDays === 1 ? "" : "s"} you showed up`;
  } else if (p.today.target !== null) {
    big = String(p.today.amount);
    caption = `of ${p.today.target} ${unitLabel(unit, p.today.target)} today`;
  } else {
    big = String(p.readingDays);
    caption = `reading day${p.readingDays === 1 ? "" : "s"} of ${p.effectiveDuration}`;
  }

  return (
    <>
      <Hero
        tone="paper"
        title={challenge.name}
        subtitle={phase === "active" ? `Day ${p.clock.dayNumber} of ${challenge.durationDays}` : phase === "upcoming" ? "Not started yet" : "Complete"}
        back={{ href: "/", label: "All challenges" }}
        settingsHref={`/c/${challenge.id}/settings`}
      >
        <div className="px-5 pt-6">
          <StreakBanner title={banner.title} sub={banner.sub} />
          {phase === "active" ? (
            <div className="mt-4">
              <DayOneBanner view={view} onLog={openDayOneCheckIn} />
            </div>
          ) : null}
        </div>
        <div className="animate-rise pt-4">
          <DayRing progress={p} durationDays={challenge.durationDays} size={312}>
            <div>
              <p className="display text-[92px] tabular" aria-live="polite" data-testid="ring-figure">
                {big}
              </p>
              <p className="mt-2 flex items-center justify-center gap-1 text-sm text-ink/55">
                {caption}
                {p.today.goalMet && phase === "active" ? <Icon.check className="size-4 text-good" /> : null}
              </p>
            </div>
          </DayRing>
        </div>
        <div className="flex items-center justify-center gap-2.5 px-5 pb-2 pt-5">
          {phase === "active" ? (
            <Button onClick={openCheckIn}>Log reading</Button>
          ) : phase === "ended" ? (
            <ButtonLink href={`/c/${challenge.id}/complete`}>Your recap</ButtonLink>
          ) : null}
          <IconButton
            label={shared ? "Invite link copied" : "Invite friends"}
            variant="dashed"
            onClick={async () => {
              const r = await shareInvite({ joinCode: challenge.joinCode, name: challenge.name, id: challenge.id });
              if (r === "copied") {
                setShared(true);
                setTimeout(() => setShared(false), 2000);
              }
            }}
          >
            {shared ? <Icon.check /> : <Icon.send />}
          </IconButton>
          <IconLink href={`/c/${challenge.id}/stats`} label="Challenge stats" variant="dashed">
            <Icon.chart />
          </IconLink>
          <IconLink href={`/c/${challenge.id}/leaderboard`} label="Leaderboard" variant="dashed">
            <Icon.trophy />
          </IconLink>
        </div>
      </Hero>

      <div className="space-y-3 px-5 pt-5">
        <PassPrompt />
        <CoachCard view={view} me={me} />
        {view.members.length <= 1 && phase !== "ended" && phase !== "archived" ? (
          <Card className="space-y-4">
            <div>
              <p className="headline text-[22px]">Reading is better together</p>
              <p className="mt-1 text-ink/60">Invite your friends. Everyone picks their own book and goal.</p>
            </div>
            <InviteActions joinCode={challenge.joinCode} challengeName={challenge.name} challengeId={challenge.id} />
          </Card>
        ) : null}
      </div>

      <PageSheet overlap={false} aria-labelledby="crew-title">
        <div className="flex items-center justify-between">
          <h2 id="crew-title" className="headline text-[26px]">
            Your reading crew
          </h2>
          <Link href={`/c/${challenge.id}/people`} className="inline-flex h-9 items-center gap-1 rounded-pill bg-ink px-4 text-sm font-medium text-white">
            All <Icon.chevron className="size-4" />
          </Link>
        </div>
        {line ? <p className="mt-1.5 text-sm text-muted">{line}</p> : null}
        <div className="mt-2">
          <CrewList members={crew} challengeId={challenge.id} myId={me.participant.id} />
        </div>
      </PageSheet>
    </>
  );
}
