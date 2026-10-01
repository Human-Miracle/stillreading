import Link from "next/link";
import type { CSSProperties } from "react";
import { categoryMeta, formatCategoryValue, type LeaderboardEntry } from "@/lib/domain/leaderboard";
import { n } from "@/lib/format";
import { cn } from "../ui/cn";

/**
 * Leaderboard palette. Fixed in both colour schemes: the podium always sits on its own black stage.
 * Text colours are tinted darks chosen for ≥4.5:1 contrast on each swatch.
 */
const FLAGS = [
  { name: "Tiger Flame", bg: "#FE6237", ink: "#3a0f03", sub: "#5e1f0c" },
  { name: "Sunflower Gold", bg: "#FFB62E", ink: "#3b2500", sub: "#6b4500" },
  { name: "Maya Blue", bg: "#7CC3FF", ink: "#0a2a52", sub: "#1f4f86" },
] as const;
const SAPPHIRE = "#4164FF";

const PODIUM_SIZE = 3;

interface PodiumProps {
  entries: readonly LeaderboardEntry[];
  challengeId: string;
  myParticipantId: string | null;
}

function BestAt({ entry }: { entry: LeaderboardEntry }) {
  if (!entry.best) return null;
  const meta = categoryMeta(entry.best.key);
  return (
    <span className="truncate">
      <span aria-hidden>{meta.icon}</span> {formatCategoryValue(entry.best.key, entry.best.value)}
    </span>
  );
}

/**
 * Top readers as a cascade of flags, each stepping down and to the right of the one above, ending in a
 * larger card with everyone else. Flags have a square top-left corner, a rounded top-right corner and a
 * triangular tail that drops from the bottom-left edge.
 */
export function Podium({ entries, challengeId, myParticipantId }: PodiumProps) {
  const top = entries.filter((e) => e.xp > 0).slice(0, PODIUM_SIZE);
  const rest = entries.slice(top.length);
  const steps = top.length;

  return (
    <div className="rounded-card bg-black p-4 sm:p-6">
      {/* Container units keep the cascade proportional to the stage width, from phones up. */}
      <ol aria-label="Top readers" className="@container" style={{ "--step": "11cqw" } as CSSProperties}>
        {top.map((entry, i) => {
          const flag = FLAGS[i]!;
          const isMe = entry.participantId === myParticipantId;
          return (
            <li
              key={entry.participantId}
              className="relative animate-rise"
              style={{ marginLeft: `calc(var(--step) * ${i})`, width: `calc(100% - var(--step) * ${steps})`, zIndex: i, animationDelay: `${i * 70}ms` }}
            >
              <Link
                href={`/c/${challengeId}/people/${entry.participantId}`}
                className="block min-h-32 rounded-tr-2xl px-4 pb-5 pt-3.5 sm:min-h-36 sm:px-5"
                style={{ background: flag.bg, color: flag.ink }}
              >
                <p className="truncate font-display text-[1.65rem] leading-tight font-medium tracking-tight sm:text-3xl">{entry.displayName}</p>
                <p className="mt-0.5 text-sm font-medium tabular" style={{ color: flag.sub }}>
                  #{entry.rank} · {n(entry.xp)} XP{isMe ? " · you" : ""}
                </p>
                <p className="mt-3 flex text-xs font-semibold" style={{ color: flag.sub }}>
                  <BestAt entry={entry} />
                </p>
              </Link>
              <span
                aria-hidden
                className="absolute left-0 top-full"
                style={{ width: "var(--step)", height: "calc(var(--step) * 0.58)", background: flag.bg, clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
              />
            </li>
          );
        })}
        <li
          className="relative animate-rise"
          style={{ marginLeft: `calc(var(--step) * ${steps})`, width: `calc(100% - var(--step) * ${steps})`, zIndex: steps, animationDelay: `${steps * 70}ms` }}
        >
          <section className="min-h-56 rounded-tr-2xl px-4 pb-4 pt-3.5 text-white sm:min-h-64 sm:px-5" style={{ background: SAPPHIRE }} aria-label="Standings">
            <p className="font-display text-[1.65rem] leading-tight font-medium tracking-tight sm:text-3xl">{top.length ? "The rest of the shelf" : "Standings"}</p>
            <p className="mt-0.5 text-sm font-medium">{top.length ? `#${top.length + 1} onward` : "XP appears after the first check-ins"}</p>
            {rest.length ? (
              <ol className="mt-3 divide-y divide-white/25">
                {rest.map((entry) => (
                  <li key={entry.participantId}>
                    <Link href={`/c/${challengeId}/people/${entry.participantId}`} className="flex items-baseline gap-2 py-2 text-sm">
                      <span className="w-7 shrink-0 font-semibold tabular">#{entry.rank}</span>
                      <span className={cn("min-w-0 flex-1 truncate", entry.participantId === myParticipantId && "font-bold")}>
                        {entry.displayName}
                        {entry.participantId === myParticipantId ? " (you)" : ""}
                      </span>
                      <span className="shrink-0 font-semibold tabular">{n(entry.xp)} XP</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm">Invite more readers to fill the board.</p>
            )}
          </section>
        </li>
      </ol>
    </div>
  );
}
