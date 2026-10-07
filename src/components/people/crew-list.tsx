import Link from "next/link";
import { amountSummary } from "@/lib/copy";
import { unitLabel } from "@/lib/domain/goals";
import type { MemberView } from "@/local/hooks";
import { Avatar, tintFor } from "../ui/avatar";
import { DayOneBadge } from "../challenge/day-one";
import { cn } from "../ui/cn";
import { ProgressBar } from "../ui/progress";

const SHORT: Partial<Record<string, string>> = { minutes: "min", chapters: "ch." };

function todayFigure(m: MemberView): { big: string; small: string } {
  const p = m.progress;
  const unit = m.goal?.targetUnit;
  if (p.today.target !== null && unit) return { big: String(p.today.amount), small: `of ${p.today.target}` };
  if (p.today.read) return { big: "✓", small: amountSummary(p.today.totals) };
  return { big: "—", small: "today" };
}

/** Reading-crew rows (reference: "Health systems" rows + the dotted planner list). */
export function CrewRow({ member, challengeId, isMe, detail = "book" }: { member: MemberView; challengeId: string; isMe: boolean; detail?: "book" | "days" }) {
  const { participant, progress: p, currentBook } = member;
  const fig = todayFigure(member);
  const pct = p.today.target ? (p.today.amount / p.today.target) * 100 : p.today.read ? 100 : 0;
  const unit = member.goal?.targetUnit;
  return (
    <li className="dotted">
      <Link href={`/c/${challengeId}/people/${participant.id}`} className="flex items-center gap-3.5 py-4">
        <Avatar name={participant.displayName} id={participant.id} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em]">
            <span className="truncate">{participant.displayName}</span>
            {isMe ? <span className="text-xs font-normal text-muted">you</span> : null}
            {participant.role === "host" ? <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">Host</span> : null}
            {member.dayOne ? <DayOneBadge className="shrink-0" /> : null}
            {p.streak.current >= 2 ? <span className="text-xs font-normal text-muted">· {p.streak.current}d streak</span> : null}
          </p>
          <ProgressBar value={pct} label={`${participant.displayName} today`} tint={tintFor(participant.id)} />
          <p className="truncate text-xs text-muted">
            {detail === "days"
              ? `${p.goalDays}/${p.days.length} goal days${member.progress.goal ? ` · ${member.progress.goal.percent.display}% of goal` : ""}`
              : (currentBook?.title ?? (p.today.read ? "Read today" : "Not checked in yet today"))}
          </p>
        </div>
        <div className="w-16 text-right">
          <p className={cn("display text-[28px] tabular", !p.today.read && "text-ink/25")}>{fig.big}</p>
          <p className="truncate text-[11px] text-muted">
            {fig.small}
            {p.today.target !== null && unit ? ` ${SHORT[unit] ?? unitLabel(unit, p.today.target)}` : ""}
          </p>
        </div>
      </Link>
    </li>
  );
}

export function CrewList({ members, challengeId, myId, detail }: { members: MemberView[]; challengeId: string; myId: string; detail?: "book" | "days" }) {
  return (
    <ul>
      {members.map((m) => (
        <CrewRow key={m.participant.id} member={m} challengeId={challengeId} isMe={m.participant.id === myId} detail={detail} />
      ))}
    </ul>
  );
}
