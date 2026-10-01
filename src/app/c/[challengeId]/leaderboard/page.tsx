"use client";
import { useChallenge } from "@/components/challenge/context";
import { Hero } from "@/components/challenge/hero";
import { StreakBanner } from "@/components/challenge/streak-banner";
import { Podium } from "@/components/leaderboard/podium";
import { Card, Eyebrow, PageSheet } from "@/components/ui/card";
import { PLACE_BONUS, XP_CATEGORIES, formatCategoryValue } from "@/lib/domain/leaderboard";
import { n } from "@/lib/format";

const ordinal = (r: number) => `${r}${r % 10 === 1 && r % 100 !== 11 ? "st" : r % 10 === 2 && r % 100 !== 12 ? "nd" : r % 10 === 3 && r % 100 !== 13 ? "rd" : "th"}`;

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
            XP grows with <span className="text-white">every page and minute</span> you read, plus <span className="text-white">showing up</span> and leading a stat.
          </p>
          <div className="mt-7">
            <Podium entries={view.leaderboard} challengeId={challenge.id} myParticipantId={challenge.myParticipantId} />
          </div>
        </div>
      </Hero>

      <PageSheet className="space-y-4">
        {mine ? (
          <section>
            <StreakBanner title={`You earned ${n(mine.xp)} XP`} sub="Your place in each stat" />
            <ul className="mt-2">
              {XP_CATEGORIES.map((meta) => {
                const c = mine.categories.find((x) => x.key === meta.key)!;
                return (
                  <li key={meta.key} className="dotted flex items-center gap-3 py-3.5">
                    <span className="grid size-10 place-items-center rounded-full bg-surface-2" aria-hidden>
                      {meta.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium tracking-[-0.01em]">{meta.label}</p>
                      <p className="truncate text-sm text-muted">
                        {c.value === 0
                          ? "Nothing yet"
                          : `${formatCategoryValue(meta.key, c.value)}${c.bonus ? ` · ${ordinal(c.rank!)} +${c.bonus} bonus` : ""}`}
                      </p>
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
            Most XP comes from reading itself. Pages, chapters and minutes are compared by roughly how long they take to read, so more reading always
            means more XP, whatever you track.
          </p>
          <ul className="mt-4 divide-y divide-line/70 text-sm">
            {XP_CATEGORIES.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span aria-hidden>{c.icon}</span> {c.per[0]!.toUpperCase() + c.per.slice(1)}
                </span>
                <span className="font-medium tabular">+{c.rate} XP</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink/70">Leading a stat adds a bonus:</p>
          <ul className="mt-2 grid grid-cols-3 gap-2 text-center">
            {PLACE_BONUS.map((xp, i) => (
              <li key={xp} className={`rounded-2xl px-2 py-3 ${["bg-butter", "bg-blush", "bg-sky"][i]}`}>
                <span className="block text-sm font-medium">{ordinal(i + 1)}</span>
                <span className="text-xl font-medium tracking-[-0.03em] tabular">+{xp}</span>
                <span className="text-xs text-ink/60"> XP</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">A page counts as about 1.5 minutes of reading and a chapter about 20. Ties share a place.</p>
        </Card>
      </PageSheet>
    </>
  );
}
