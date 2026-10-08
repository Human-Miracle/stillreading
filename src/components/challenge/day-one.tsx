"use client";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { canOpenDayOneWindow, dayOneWindow, formatCountdown, DAY_ONE_WINDOW_MS, type DayOneWindow } from "@/lib/domain/day-one";
import type { LocalChallenge } from "@/local/db";
import type { ChallengeView } from "@/local/hooks";
import { openDayOneWindow } from "@/local/repo";
import { getSyncEngine } from "@/local/sync/engine";
import { Button } from "../ui/button";
import { Card, Eyebrow } from "../ui/card";

const WINDOW_MINUTES = DAY_ONE_WINDOW_MS / 60_000;

/**
 * The Day One window, re-evaluated every second while it looks open so the countdown stays live. A
 * window that synced in late may look open for one tick before the clock catches up and closes it.
 */
export function useDayOneWindow(challenge: Pick<LocalChallenge, "dayOneWindowOpensAt">): DayOneWindow {
  const [now, setNow] = useState(() => new Date());
  const w = dayOneWindow(challenge.dayOneWindowOpensAt, now);
  const open = w.state === "open";
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [open]);
  return w;
}

/** Home-screen call to action while the window is open. */
export function DayOneBanner({ view, onLog }: { view: ChallengeView; onLog: () => void }) {
  const w = useDayOneWindow(view.challenge);
  if (w.state !== "open" || !view.me || view.today === view.challenge.startDate) return null;
  const earned = view.me.dayOne;
  return (
    <Card tone="butter" className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow className="text-ink/60">Day One window</Eyebrow>
        <span className="display tabular text-[28px]" data-testid="day-one-countdown">
          {formatCountdown(w.msLeft)}
        </span>
      </div>
      <p className="text-[17px] leading-snug tracking-[-0.015em]">
        {earned
          ? "You've got the Day One badge. Log more Day 1 reading before the window closes for good."
          : "For a few minutes only, you can log reading for Day 1 and earn the Day One badge. When the timer ends, it's gone for good."}
      </p>
      <Button size="sm" onClick={onLog}>
        Log Day 1 reading
      </Button>
    </Card>
  );
}

/**
 * The Day One spot on the challenge home: the countdown while the window is open, and for the host,
 * the button to open it while it's still unused.
 */
export function DayOneHome({ view, onLog }: { view: ChallengeView; onLog: () => void }) {
  const w = useDayOneWindow(view.challenge);
  if (w.state === "open" && view.today !== view.challenge.startDate) {
    return (
      <div className="mt-4">
        <DayOneBanner view={view} onLog={onLog} />
      </div>
    );
  }
  if (view.isHost && w.state === "unopened" && canOpenDayOneWindow(view.challenge)) {
    return (
      <div className="mt-4">
        <DayOneHostCard view={view} />
      </div>
    );
  }
  return null;
}

/** Settings card for the host: open the one-time window, then show its status. */
export function DayOneHostCard({ view }: { view: ChallengeView }) {
  const { challenge } = view;
  const w = useDayOneWindow(challenge);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const earned = view.members.filter((m) => m.dayOne).length;

  let body: React.ReactNode;
  if (w.state === "open") {
    body = (
      <p className="text-ink-2">
        Open now: <span className="tabular font-semibold">{formatCountdown(w.msLeft)}</span> left. {earned} of {view.members.length} readers have the badge.
      </p>
    );
  } else if (w.state === "closed") {
    // Used and over for good: nothing left to do here.
    return null;
  } else if (!canOpenDayOneWindow(challenge)) {
    body = <p className="text-ink-2">Available from Day 3 while the challenge is running. Everyone who reads on Day 1 gets the badge.</p>;
  } else {
    body = (
      <>
        <p className="text-ink-2">
          Give everyone {WINDOW_MINUTES} minutes to log reading for Day 1 and earn the Day One badge. You can only do this once, and it can&apos;t be reopened.
        </p>
        {error ? (
          <p className="text-sm text-[#c2321f]" role="alert">
            {error}
          </p>
        ) : null}
        {confirming ? (
          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await openDayOneWindow(challenge.id);
                  track("day_one_window_opened", { challengeId: challenge.id });
                  void getSyncEngine().sync();
                  setConfirming(false);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Couldn't open the window. Are you online?");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Opening…" : `Start ${WINDOW_MINUTES}-minute window`}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Open Day One window
          </Button>
        )}
      </>
    );
  }

  return (
    <Card className="space-y-3">
      <Eyebrow>Day One badge</Eyebrow>
      {body}
    </Card>
  );
}
