"use client";
import { useEffect, useState } from "react";
import { useChallenge } from "@/components/challenge/context";
import { renderShareCard } from "@/components/challenge/share-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Notice } from "@/components/ui/misc";
import { track } from "@/lib/analytics";
import { amountSummary } from "@/lib/copy";
import { formatAmount } from "@/lib/domain/goals";
import { getPref, setPref } from "@/local/device";

export default function CompletePage() {
  const { view } = useChallenge();
  const me = view.me;
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const ended = me?.progress.clock.phase === "ended" || view.challenge.status === "archived";

  useEffect(() => {
    if (!ended) return;
    void (async () => {
      const key = `completed:${view.challenge.id}`;
      if (!(await getPref(key, false))) {
        await setPref(key, true);
        track("challenge_completed", { challengeId: view.challenge.id });
      }
    })();
  }, [ended, view.challenge.id]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  if (!me) return null;
  const p = me.progress;
  const g = p.goal;

  if (!ended) {
    return (
      <Notice>
        Your recap unlocks when the challenge ends on day {view.challenge.durationDays}. Keep going. You&apos;re on day {p.clock.dayNumber}.
      </Notice>
    );
  }

  const cardData = {
    challengeName: view.challenge.name,
    readingDays: p.readingDays,
    durationDays: p.effectiveDuration,
    totalsLine: amountSummary(p.totals),
    books: p.booksCompleted,
    longestStreak: p.streak.longest,
    goalPercent: g ? g.percent.display : null,
    host: typeof window !== "undefined" ? window.location.host : "stillreading",
  };

  const share = async () => {
    setBusy(true);
    try {
      const blob = await renderShareCard(cardData);
      const file = new File([blob], "still-reading-result.png", { type: "image/png" });
      const text = `I read for ${p.readingDays} of ${p.effectiveDuration} days in ${view.challenge.name}. 📚`;
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else {
        const url = URL.createObjectURL(blob);
        setPreview(url);
        const a = document.createElement("a");
        a.href = url;
        a.download = "still-reading-result.png";
        a.click();
      }
      track("completion_shared", { challengeId: view.challenge.id });
    } catch {
      // share cancelled
    } finally {
      setBusy(false);
    }
  };

  const fullGoal = g ? g.percent.raw >= 100 : false;

  return (
    <div className="space-y-4">
      <section className="animate-rise pt-4 text-center">
        <div className="animate-pop text-6xl" aria-hidden>
          🎉
        </div>
        <h1 className="mt-3 font-display text-4xl font-semibold">Challenge complete</h1>
        <p className="mt-2 text-lg text-ink-2">
          You showed up for <span className="font-semibold text-ink">{p.readingDays}</span> of {p.effectiveDuration} days.
        </p>
      </section>

      <Card className="space-y-3">
        <Eyebrow>Your reading</Eyebrow>
        <p className="font-display text-3xl font-semibold tabular">{amountSummary(p.totals)}</p>
        <p className="text-ink-2">
          {p.booksCompleted} book{p.booksCompleted === 1 ? "" : "s"} finished · {p.streak.longest} day longest streak
        </p>
      </Card>

      {g && me.goal ? (
        <Card className="space-y-2">
          <Eyebrow>Your goal</Eyebrow>
          <p className="font-display text-3xl font-semibold tabular">
            {g.actual.toLocaleString("en-US")} <span className="text-xl text-muted">/ {formatAmount(g.target, me.goal.targetUnit)}</span>
          </p>
          <p className="font-display text-5xl font-semibold text-accent tabular">{g.percent.display}%</p>
          {fullGoal ? (
            <p className="text-ink-2">You hit your goal. That&apos;s what showing up looks like.</p>
          ) : (
            <p className="text-ink-2">
              You didn&apos;t hit 100% of your goal. But you read for {p.readingDays} day{p.readingDays === 1 ? "" : "s"}. That&apos;s {p.readingDays} day
              {p.readingDays === 1 ? "" : "s"} you chose to show up.
            </p>
          )}
        </Card>
      ) : null}

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Your Still Reading result card" className="w-full rounded-card shadow-card" />
      ) : null}

      <div className="space-y-3">
        <Button size="lg" full disabled={busy} onClick={share}>
          {busy ? "Making your card…" : "Share my result"}
        </Button>
        <ButtonLink href="/create" variant="secondary" size="lg" full>
          Start another challenge
        </ButtonLink>
      </div>
    </div>
  );
}
