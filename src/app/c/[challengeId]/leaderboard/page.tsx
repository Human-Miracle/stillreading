"use client";
import { useChallenge } from "@/components/challenge/context";
import { Hero } from "@/components/challenge/hero";
import { StreakBanner } from "@/components/challenge/streak-banner";
import { DailyTop } from "@/components/leaderboard/daily-top";
import { Podium } from "@/components/leaderboard/podium";
import { Card, Eyebrow, PageSheet } from "@/components/ui/card";
import { PAGE_XP, XP_CATEGORIES, formatCategoryValue } from "@/lib/domain/leaderboard";
import { n } from "@/lib/format";

const ADD_ONS = XP_CATEGORIES.filter((c) => !c.core);
const capitalise = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export default function LeaderboardPage() {
  const { view } = useChallenge();
  const { challenge } = view;
  const mine = view.leaderboard.find((e) => e.participantId === challenge.myParticipantId) ?? null;

  return (
    <>
      <Hero tone="dark" title="Leaderboard" subtitle={challenge.name} back={{ href: `/c/${challenge.id}/stats`, label: "Back to stats" }} className="pb-14">
        <div className="px-5 pt-8">
          {mine ? (
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-white/50">Your XP</p>
                <p className="display mt-1 flex items-start text-[88px] tabular text-white">
                  {n(mine.xp)}
                  <span className="ml-1 mt-3 size-3 rounded-full bg-signal" aria-hidden />
                </p>
              </div>
              <p className="pb-3 text-right text-[17px] leading-tight tracking-[-0.02em] text-white/45">
                #{mine.rank}
                <br />
                of {view.leaderboard.length}
              </p>
            </div>
          ) : null}
          <p className="headline mt-5 text-[24px] leading-[1.2] text-white/45">
            XP comes from <span className="text-white">every page you read</span>, plus a little extra for <span className="text-white">showing up</span>.
          </p>
          <div className="mt-7">
            <Podium entries={view.leaderboard} challengeId={challenge.id} myParticipantId={challenge.myParticipantId} />
          </div>
        </div>
      </Hero>

      <PageSheet className="space-y-4">
        {view.isHost ? <DailyTop view={view} /> : null}
        {mine ? (
          <section>
            <StreakBanner
              title={`You earned ${n(mine.xp)} XP`}
              sub={`${n(mine.pageXp)} from ${n(mine.pages)} page${mine.pages === 1 ? "" : "s"}, ${n(mine.bonusXp)} from add-ons`}
            />
            <ul className="mt-2">
              {XP_CATEGORIES.map((meta) => {
                const c = mine.categories.find((x) => x.key === meta.key)!;
                return (
                  <li key={meta.key} className="dotted flex items-center gap-3 py-3.5">
                    <span className="grid size-10 place-items-center rounded-full bg-surface-2" aria-hidden>
                      {meta.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium tracking-[-0.01em]">
                        {meta.label}
                        {meta.core ? <span className="ml-2 rounded-pill bg-butter px-2 py-0.5 text-[11px] font-medium">Main score</span> : null}
                      </p>
                      <p className="truncate text-sm text-muted">{c.value === 0 ? "Nothing yet" : formatCategoryValue(meta.key, c.value)}</p>
                    </div>
                    <span className="text-[17px] font-medium tracking-[-0.02em] tabular">+{c.xp}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <Card tone="muted">
          <Eyebrow>How XP works</Eyebrow>
          <p className="mt-2 text-ink/70">
            Pages read drive the leaderboard. Books and chapters come in every length (a chapter can be 9 pages or 50), so pages are the fairest
            measure of how much you read.
          </p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-butter px-4 py-3">
            <span className="font-medium">
              <span aria-hidden>📖</span> Every page read
            </span>
            <span className="text-xl font-medium tracking-[-0.03em] tabular">+{PAGE_XP} XP</span>
          </div>
          <p className="mt-4 text-sm text-ink/70">Add-ons on top:</p>
          <ul className="mt-1 divide-y divide-line/70 text-sm">
            {ADD_ONS.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span aria-hidden>{c.icon}</span> {capitalise(c.per)}
                </span>
                <span className="font-medium tabular">+{c.rate} XP</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">Log pages when you check in to climb the board. Minutes and chapters still count, just a little. Equal XP shares a place.</p>
        </Card>
      </PageSheet>
    </>
  );
}
