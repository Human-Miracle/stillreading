"use client";
import { useState } from "react";
import { BADGES, badgeName, type BadgeResult } from "@/lib/domain/badges";
import type { ChallengeBadges } from "@/local/badges";
import type { ChallengeView } from "@/local/hooks";
import { Sheet } from "../ui/sheet";
import { BadgeArt } from "./badge-art";
import { BadgeDetail, BadgeShareActions, lockedFooter } from "./badge-detail";

function caption(r: BadgeResult): string {
  if (r.level > 0) return r.count > 1 ? `${r.count}×` : "Earned";
  if (r.closed) return "Out of reach";
  if (r.progress) return `${r.progress.current.toLocaleString("en-US")}/${r.progress.target.toLocaleString("en-US")}`;
  return "Locked";
}

/**
 * A member's badges. Mine shows all 20 (earned in colour, the rest as outlines with progress) and lets
 * me share earned ones; someone else's shows only what they've earned.
 */
export function BadgeGrid({ view, badges, participantId }: { view: ChallengeView; badges: ChallengeBadges; participantId: string }) {
  const isMe = participantId === view.challenge.myParticipantId;
  const results = badges.all.get(participantId) ?? [];
  const order = new Map(BADGES.map((b, i) => [b.id, i]));
  const shown = (isMe ? [...results] : results.filter((r) => r.level > 0)).sort(
    (a, b) => Number(b.level > 0) - Number(a.level > 0) || order.get(a.id)! - order.get(b.id)!,
  );
  const [open, setOpen] = useState<BadgeResult | null>(null);
  const name = view.participantsById.get(participantId)?.displayName ?? "They";

  if (!shown.length) return <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-ink/60">No badges yet.</p>;
  return (
    <>
      <ul className="grid grid-cols-3 gap-x-2 gap-y-5" aria-label={isMe ? "Your badges" : `${name}'s badges`}>
        {shown.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setOpen(r)} className="flex w-full flex-col items-center gap-1.5" aria-label={`${badgeName(r.id, Math.max(1, r.level))}: ${caption(r)}`}>
              <BadgeArt id={r.id} level={Math.max(1, r.level)} count={r.count} locked={r.level === 0} size={104} earnedOn={r.earnedOn} footer={r.level === 0 ? lockedFooter(r) : undefined} />
              <span className="line-clamp-1 text-[13px] font-medium tracking-[-0.01em]">{badgeName(r.id, Math.max(1, r.level))}</span>
              <span className="-mt-1 text-xs text-muted">{caption(r)}</span>
            </button>
          </li>
        ))}
      </ul>
      <Sheet open={open !== null} onClose={() => setOpen(null)} title="Badge">
        {open ? (
          <div className="space-y-6 pb-2">
            <BadgeDetail result={open} rarity={badges.rarity(open.id, Math.max(1, open.level))} durationDays={view.challenge.durationDays} startDate={view.challenge.startDate} owner={isMe ? "you" : name} />
            {isMe && open.level > 0 ? <BadgeShareActions challengeId={view.challenge.id} result={open} /> : null}
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
