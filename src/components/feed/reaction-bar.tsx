"use client";
import { track } from "@/lib/analytics";
import { REACTION_TYPES, type ReactionType } from "@/lib/domain/types";
import type { LocalReaction } from "@/local/db";
import { setReaction } from "@/local/repo";
import { cn } from "../ui/cn";

export const REACTION_EMOJI: Record<ReactionType, string> = { heart: "❤️", fire: "🔥", clap: "👏", laugh: "😂", book: "📚" };
const REACTION_LABEL: Record<ReactionType, string> = { heart: "Love", fire: "Fire", clap: "Applause", laugh: "Haha", book: "Bookworm" };

export function ReactionBar({ challengeId, sessionId, reactions, myParticipantId, disabled }: { challengeId: string; sessionId: string; reactions: LocalReaction[]; myParticipantId: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reactions">
      {REACTION_TYPES.map((type) => {
        const of = reactions.filter((r) => r.type === type);
        const mine = of.some((r) => r.participantId === myParticipantId);
        return (
          <button
            key={type}
            type="button"
            disabled={disabled}
            aria-pressed={mine}
            aria-label={`${REACTION_LABEL[type]}${of.length ? `, ${of.length}` : ""}`}
            onClick={() => {
              void setReaction(challengeId, sessionId, type, !mine);
              if (!mine) track("reaction_added", { challengeId, props: { type } });
            }}
            className={cn(
              "inline-flex h-9 min-w-11 items-center justify-center gap-1 rounded-pill px-3 text-[13px] font-medium tabular transition-all active:scale-90",
              mine ? "bg-ink text-white" : "bg-surface-2 text-ink/60 hover:bg-line",
              !of.length && !mine && "grayscale-[0.6] opacity-70",
            )}
          >
            <span aria-hidden className="text-[15px]">
              {REACTION_EMOJI[type]}
            </span>
            {of.length ? <span>{of.length}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
