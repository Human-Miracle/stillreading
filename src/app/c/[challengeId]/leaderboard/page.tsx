"use client";
import Link from "next/link";
import { useChallenge } from "@/components/challenge/context";
import { Podium } from "@/components/leaderboard/podium";
import { Card, Eyebrow } from "@/components/ui/card";
import { MIN_XP, RANK_XP, XP_CATEGORIES, formatCategoryValue } from "@/lib/domain/leaderboard";
import { n } from "@/lib/format";

const ordinal = (r: number) => `${r}${r % 10 === 1 && r % 100 !== 11 ? "st" : r % 10 === 2 && r % 100 !== 12 ? "nd" : r % 10 === 3 && r % 100 !== 13 ? "rd" : "th"}`;

export default function LeaderboardPage() {
  const { view } = useChallenge();
  const { challenge } = view;
  const mine = view.leaderboard.find((e) => e.participantId === challenge.myParticipantId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-semibold">Leaderboard</h1>
        <Link href={`/c/${challenge.id}/stats`} className="text-sm font-semibold text-accent">
          Stats →
        </Link>
      </div>
      <p className="text-ink-2">Top readers by XP, earned by ranking in every stat.</p>

      <Podium entries={view.leaderboard} challengeId={challenge.id} myParticipantId={challenge.myParticipantId} />

      {mine ? (
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <Eyebrow>Your XP</Eyebrow>
            <p className="font-display text-2xl font-semibold tabular">
              {n(mine.xp)} XP <span className="text-base font-normal text-muted">· #{mine.rank}</span>
            </p>
          </div>
          <ul className="mt-2 divide-y divide-line">
            {XP_CATEGORIES.map((meta) => {
              const c = mine.categories.find((x) => x.key === meta.key)!;
              return (
                <li key={meta.key} className="flex items-center gap-3 py-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-paper-2" aria-hidden>
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{meta.label}</p>
                    <p className="truncate text-sm text-muted">{c.rank === null ? "Not ranked yet" : `${ordinal(c.rank)} · ${formatCategoryValue(meta.key, c.value)}`}</p>
                  </div>
                  <span className="tabular text-sm font-semibold text-ink-2">+{c.xp}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card>
        <Eyebrow>How XP works</Eyebrow>
        <p className="mt-2 text-ink-2">
          Everyone is ranked in each stat: streak, consistency, reading days, pages, minutes, chapters and books finished. Your place in each one earns XP:
        </p>
        <ul className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          {RANK_XP.slice(0, 3).map((xp, i) => (
            <li key={xp} className="rounded-xl bg-paper-2 px-2 py-2">
              <span className="block font-semibold">{ordinal(i + 1)}</span>
              <span className="tabular text-muted">{xp} XP</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          Then {RANK_XP.slice(3).join(", ")} XP, and {MIN_XP} XP for anyone else with progress in that stat. Ties share a place. Pages, minutes and chapters are
          never added together — each is its own race.
        </p>
      </Card>
    </div>
  );
}
