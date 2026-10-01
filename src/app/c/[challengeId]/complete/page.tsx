"use client";
import { useEffect, useState } from "react";
import { useChallenge } from "@/components/challenge/context";
import { Hero } from "@/components/challenge/hero";
import { renderShareCard } from "@/components/challenge/share-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow, PageSheet } from "@/components/ui/card";
import { Notice } from "@/components/ui/misc";
import { ProgressBar } from "@/components/ui/progress";
import { track } from "@/lib/analytics";
import { amountSummary } from "@/lib/copy";
import { formatAmount } from "@/lib/domain/goals";
import { getPref, setPref } from "@/local/device";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/45 px-3 py-4 text-center backdrop-blur-md">
      <p className="text-xs text-ink/55">{label}</p>
      <p className="mt-1 truncate text-lg font-medium tracking-[-0.03em] tabular">{value}</p>
    </div>
  );
}

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
  const back = { href: `/c/${view.challenge.id}`, label: "Back to challenge" };

  if (!ended) {
    return (
      <>
        <Hero tone="paper" title="Your recap" back={back} />
        <div className="px-5 pt-6">
          <Notice>
            Your recap unlocks when the challenge ends on day {view.challenge.durationDays}. Keep going. You&apos;re on day {p.clock.dayNumber}.
          </Notice>
        </div>
      </>
    );
  }

  const share = async () => {
    setBusy(true);
    try {
      const blob = await renderShareCard({
        challengeName: view.challenge.name,
        readingDays: p.readingDays,
        durationDays: p.effectiveDuration,
        totalsLine: amountSummary(p.totals),
        books: p.booksCompleted,
        longestStreak: p.streak.longest,
        goalPercent: g ? g.percent.display : null,
        host: window.location.host,
      });
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
    <>
      <Hero tone="honey" title={view.challenge.name} subtitle="Recap" back={back} className="pb-12">
        <div className="px-5 pt-10 text-center">
          <h1 className="text-[15px] font-medium tracking-[-0.01em] text-white">Challenge complete</h1>
          <p className="display animate-pop text-[132px] tabular text-white">{p.readingDays}</p>
          <p className="mt-1 font-medium text-white/90">You showed up for {p.readingDays} of {p.effectiveDuration} days.</p>
          <div className="mt-8 grid grid-cols-3 gap-2.5">
            <Tile label="Read" value={amountSummary(p.totals)} />
            <Tile label="Books" value={String(p.booksCompleted)} />
            <Tile label="Best streak" value={`${p.streak.longest}d`} />
          </div>
        </div>
      </Hero>

      <PageSheet className="space-y-4">
        {g && me.goal ? (
          <Card tone="muted" className="space-y-4">
            <Eyebrow>Your goal</Eyebrow>
            <div className="flex items-end justify-between">
              <p className="display text-[44px] tabular">
                {g.actual.toLocaleString("en-US")}
                <span className="ml-1 text-base tracking-normal text-muted">/ {formatAmount(g.target, me.goal.targetUnit)}</span>
              </p>
              <p className="display pb-1 text-[32px] tabular">{g.percent.display}%</p>
            </div>
            <ProgressBar value={g.percent.display} label="Goal" tint={fullGoal ? "sage" : "butter"} className="bg-white" />
            <p className="text-ink/70">
              {fullGoal
                ? "You hit your goal. That's what showing up looks like."
                : `You didn't hit 100% of your goal. But you read for ${p.readingDays} day${p.readingDays === 1 ? "" : "s"}. That's ${p.readingDays} day${p.readingDays === 1 ? "" : "s"} you chose to show up.`}
            </p>
          </Card>
        ) : null}

        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your Still Reading result card" className="w-full rounded-card shadow-soft" />
        ) : null}

        <div className="space-y-2.5 pt-2">
          <Button size="lg" full disabled={busy} onClick={share}>
            {busy ? "Making your card…" : "Share my result"}
          </Button>
          <ButtonLink href="/create" variant="secondary" size="lg" full>
            Start another challenge
          </ButtonLink>
        </div>
      </PageSheet>
    </>
  );
}
