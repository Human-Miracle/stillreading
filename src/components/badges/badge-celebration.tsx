"use client";
import { useEffect, useState } from "react";
import { badgeKey, type BadgeResult } from "@/lib/domain/badges";
import { earnedKeys, markBadgesSeen, seenBadges, type ChallengeBadges } from "@/local/badges";
import type { ChallengeView } from "@/local/hooks";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";
import { BadgeDetail, BadgeShareActions } from "./badge-detail";

/** Automated test browsers turn the pop-up off so it doesn't cover the screens they drive. */
function popupsOff(): boolean {
  try {
    return localStorage.getItem("sr-badge-popups") === "off";
  } catch {
    return false;
  }
}

/**
 * Pops up when I've earned badges this device hasn't celebrated yet: on opening the app or while
 * moving around in it. Several at once show as "1 of 3". Held back while `paused` (e.g. the check-in
 * screen is open), so it never covers what I'm doing.
 */
export function BadgeCelebration({ view, badges, paused }: { view: ChallengeView; badges: ChallengeBadges; paused: boolean }) {
  const challengeId = view.challenge.id;
  const [queue, setQueue] = useState<BadgeResult[] | null>(null);
  const [index, setIndex] = useState(0);
  const earned = badges.mine.filter((b) => b.level > 0);
  const signature = earned.map(badgeKey).join(",");

  useEffect(() => {
    if (!view.me || paused || queue?.length || popupsOff()) return;
    let live = true;
    void seenBadges(challengeId).then((seen) => {
      if (!live) return;
      const fresh = earned.filter((b) => !seen.has(badgeKey(b)));
      if (fresh.length) {
        setIndex(0);
        setQueue(fresh);
      }
    });
    return () => {
      live = false;
    };
    // `signature` stands in for `earned`: re-check only when the set of earned badges changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId, signature, paused, view.me]);

  if (!queue?.length || paused) return null;
  const current = queue[Math.min(index, queue.length - 1)]!;
  const last = index >= queue.length - 1;
  const close = () => {
    void markBadgesSeen(challengeId, queue.flatMap(earnedKeys));
    setQueue(null);
  };

  return (
    <Sheet open onClose={close} title={queue.length > 1 ? `New badge · ${index + 1} of ${queue.length}` : "New badge"}>
      <div className="space-y-6 pb-2">
        <BadgeDetail result={current} rarity={badges.rarity(current.id, current.level)} durationDays={view.challenge.durationDays} startDate={view.challenge.startDate} owner="you" ownerName={view.me?.participant.displayName} />
        <BadgeShareActions key={badgeKey(current)} challengeId={challengeId} result={current} />
        <Button full variant="ghost" onClick={() => (last ? close() : setIndex(index + 1))}>
          {last ? "Done" : "Next badge"}
        </Button>
      </div>
    </Sheet>
  );
}
