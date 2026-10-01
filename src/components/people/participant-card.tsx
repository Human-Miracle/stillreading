import Link from "next/link";
import { amountSummary } from "@/lib/copy";
import { describeGoal } from "@/lib/domain/goals";
import type { MemberView } from "@/local/hooks";
import { StreakBadge } from "../challenge/streak-badge";
import { Avatar } from "../ui/avatar";
import { cn } from "../ui/cn";

export function ParticipantCard({ member, challengeId, isMe, detailed = false }: { member: MemberView; challengeId: string; isMe: boolean; detailed?: boolean }) {
  const { participant, progress: p, currentBook } = member;
  return (
    <li>
      <Link
        href={`/c/${challengeId}/people/${participant.id}`}
        className={cn("flex items-center gap-3 rounded-card border border-line/60 bg-card px-4 py-3.5 shadow-card transition-colors hover:bg-paper-2", isMe && "border-accent/40")}
      >
        <Avatar name={participant.displayName} id={participant.id} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">
            <span className="truncate">{participant.displayName}</span>
            {isMe ? <span className="text-xs font-semibold text-muted">(you)</span> : null}
            {participant.role === "host" ? <span className="rounded-pill bg-paper-2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">Host</span> : null}
          </p>
          <p className="truncate text-sm text-muted">{currentBook ? currentBook.title : member.goal ? describeGoal(member.goal) : "No book yet"}</p>
          <p className={cn("text-sm", p.today.read ? "font-semibold text-success" : "text-muted")}>
            {p.today.read ? `${amountSummary(p.today.totals)} today${p.today.goalMet ? " ✓" : ""}` : "Not checked in yet today"}
          </p>
          {detailed ? (
            <p className="text-sm text-muted tabular">
              {p.goalDays}/{p.days.length} goal days{member.progress.goal ? ` · ${member.progress.goal.percent.display}% of goal` : ""}
            </p>
          ) : null}
        </div>
        <StreakBadge days={p.streak.current} size="sm" />
      </Link>
    </li>
  );
}
