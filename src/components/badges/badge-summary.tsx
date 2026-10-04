"use client";
import Link from "next/link";
import { BADGES, badgeName, type BadgeResult } from "@/lib/domain/badges";
import { Icon } from "../ui/icons";
import { BadgeArt } from "./badge-art";

/** Up to three badges to show off: the latest earned, or (before any) the closest to being earned. */
function showcase(mine: BadgeResult[]): BadgeResult[] {
  const earned = mine.filter((b) => b.level > 0).sort((a, b) => (b.earnedOn ?? "").localeCompare(a.earnedOn ?? ""));
  if (earned.length) return earned.slice(0, 3);
  const share = (b: BadgeResult) => (b.progress ? b.progress.current / Math.max(1, b.progress.target) : 0);
  return mine.filter((b) => !b.closed).sort((a, b) => share(b) - share(a)).slice(0, 3);
}

/** The fanned badges on the home card: the newest in front. */
const FAN = [
  { left: 30, top: 0, rotate: 0, z: 3 },
  { left: 4, top: 9, rotate: -10, z: 2 },
  { left: 56, top: 9, rotate: 10, z: 1 },
];

/** My badges at a glance on the challenge home; the whole card opens the full grid. */
export function BadgeSummary({ challengeId, mine, ownerName, className }: { challengeId: string; mine: BadgeResult[]; ownerName: string; className?: string }) {
  const earned = mine.filter((b) => b.level > 0);
  const shown = showcase(mine);
  const latest = earned.length ? shown[0] : null;
  const next = latest ? null : shown.find((b) => b.progress);
  const total = BADGES.length;

  return (
    <Link
      href={`/c/${challengeId}/me?tab=badges`}
      className={`relative flex flex-col overflow-hidden rounded-[1.75rem] bg-[linear-gradient(110deg,#bdbcfa_0%,#cfcefb_55%,#e7c6e6_100%)] px-5 pb-5 pt-4 ${className ?? ""}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-ink/60">Badges</p>
          <p className="mt-1.5 text-[17px] leading-snug tracking-[-0.015em]">
            {earned.length ? (
              <>
                <span className="font-semibold">
                  {earned.length} of {total}
                </span>{" "}
                earned
              </>
            ) : (
              "Earn your first badge"
            )}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm text-ink/60">
            {latest
              ? `Latest: ${badgeName(latest.id, latest.level)}`
              : next?.progress
                ? `Next up: ${badgeName(next.id, 1)} · ${next.progress.current.toLocaleString("en-US")} of ${next.progress.target.toLocaleString("en-US")}`
                : "Check in to start collecting."}
          </p>
        </div>
        <div className="relative -mr-1 h-[78px] w-[106px] shrink-0" aria-hidden>
          {shown.map((b, i) => (
            <div key={b.id} className="absolute" style={{ left: FAN[i]!.left, top: FAN[i]!.top, zIndex: FAN[i]!.z, transform: `rotate(${FAN[i]!.rotate}deg)` }}>
              <BadgeArt id={b.id} level={Math.max(1, b.level)} count={b.count} locked={b.level === 0} size={50} earnedOn={b.earnedOn} owner={b.level > 0 ? ownerName : null} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto pt-4">
        <span className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-pill bg-ink px-4 text-sm font-medium text-white">
          {earned.length ? "See your badges" : "See all badges"} <Icon.chevron className="size-4" />
        </span>
      </div>
    </Link>
  );
}
