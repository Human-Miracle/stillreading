"use client";
import { TIME_STONE_EVERY, TIME_STONE_MAX } from "@/lib/domain/time-stones";
import type { TimeStoneState } from "@/local/hooks";
import { Button } from "../ui/button";

/** A Time Stone token: filled when held, an outline when the slot is empty. */
function Stone({ held }: { held: boolean }) {
  return (
    <span
      className={
        held
          ? "grid size-11 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#cfe0ff_35%,#6f8fe6_100%)] text-[22px] shadow-[0_6px_14px_-6px_rgba(47,86,184,0.7)]"
          : "grid size-11 place-items-center rounded-full border-2 border-dashed border-ink/20 text-[20px] opacity-40 grayscale"
      }
      aria-hidden
    >
      ⏳
    </span>
  );
}

/** My Time Stones on the challenge home: how many I hold, the next one, and a nudge to use one. */
export function TimeStoneCard({ stones, onUse, className }: { stones: TimeStoneState; onUse: () => void; className?: string }) {
  const { held, toNext } = stones.wallet;
  const progress = TIME_STONE_EVERY - toNext;
  let body: string;
  if (stones.canRestore) body = "You missed yesterday. Use a Time Stone to log it before midnight and keep your streak.";
  else if (held >= TIME_STONE_MAX) body = `You're holding the most you can (${TIME_STONE_MAX}). Miss a day? Log it the next day with a stone.`;
  else if (held > 0) body = `You have ${held === 1 ? "a Time Stone" : `${held} Time Stones`}. Miss a day? Log it the next day with a stone.`;
  else body = `Earn a Time Stone every ${TIME_STONE_EVERY} days you read. It brings back a day you missed.`;

  return (
    <section className={`relative flex flex-col overflow-hidden rounded-[1.75rem] bg-[linear-gradient(110deg,#b5cdf3_0%,#cddcf5_55%,#e4e2f6_100%)] px-5 pb-5 pt-4 ${className ?? ""}`} aria-label="Time Stones">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-ink/60">Time Stones</p>
          <p className="mt-1.5 text-[17px] leading-snug tracking-[-0.015em]">
            <span className="font-semibold">
              {held} of {TIME_STONE_MAX}
            </span>{" "}
            ready
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {Array.from({ length: TIME_STONE_MAX }, (_, i) => (
            <Stone key={i} held={i < held} />
          ))}
        </div>
      </div>
      <p className="mt-2 text-sm leading-snug text-ink/70">{body}</p>
      {stones.canRestore ? (
        <div className="mt-auto pt-4">
          <Button size="sm" onClick={onUse}>
            Use a Time Stone
          </Button>
        </div>
      ) : held < TIME_STONE_MAX ? (
        <div className="mt-auto pt-4">
          <div className="h-1.5 overflow-hidden rounded-pill bg-ink/10" role="progressbar" aria-label="Next Time Stone" aria-valuemin={0} aria-valuemax={TIME_STONE_EVERY} aria-valuenow={progress}>
            <div className="h-full rounded-pill bg-ink/70" style={{ width: `${(progress / TIME_STONE_EVERY) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-ink/55">
            Next stone in {toNext} reading day{toNext === 1 ? "" : "s"}
          </p>
        </div>
      ) : null}
    </section>
  );
}
