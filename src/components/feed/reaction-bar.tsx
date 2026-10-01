"use client";
import { track } from "@/lib/analytics";
import { REACTION_TYPES, type ReactionType } from "@/lib/domain/types";
import type { LocalReaction } from "@/local/db";
import { setReaction } from "@/local/repo";
import { cn } from "../ui/cn";

export const REACTION_EMOJI: Record<ReactionType, string> = { heart: "❤️", fire: "🔥", clap: "👏", book: "📚" };
const REACTION_LABEL: Record<ReactionType, string> = { heart: "Love", fire: "Fire", clap: "Applause", book: "Bookworm" };

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
              "inline-flex min-h-10 min-w-12 items-center justify-center gap-1 rounded-pill border px-3 text-sm font-semibold tabular transition-colors active:scale-95",
              mine ? "border-accent/60 bg-accent-soft text-ink" : "border-line bg-card text-muted hover:border-muted/50",
              !of.length && !mine && "opacity-70",
            )}
          >
            <span aria-hidden>{REACTION_EMOJI[type]}</span>
            {of.length ? <span>{of.length}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
