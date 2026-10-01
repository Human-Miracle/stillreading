import type { GroupStats, Leader } from "@/lib/domain/stats";
import { n } from "@/lib/format";
import { Card, Eyebrow } from "../ui/card";

function LeaderRow({ icon, title, leader, format }: { icon: string; title: string; leader: Leader | null; format: (v: number) => string }) {
  if (!leader) return null;
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="grid size-11 place-items-center rounded-2xl bg-paper-2 text-xl" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">{title}</p>
        <p className="truncate font-semibold">
          {leader.displayName} — <span className="tabular">{format(leader.value)}</span>
        </p>
      </div>
    </li>
  );
}

export function ChallengeStats({ stats }: { stats: GroupStats }) {
  const { leaders } = stats;
  const any = Object.values(leaders).some(Boolean);
  return (
    <Card>
      <Eyebrow>Challenge stats</Eyebrow>
      {any ? (
        <ul className="divide-y divide-line">
          <LeaderRow icon="🔥" title="Longest streak" leader={leaders.currentStreak} format={(v) => `${v} day${v === 1 ? "" : "s"}`} />
          <LeaderRow icon="🎯" title="Most consistent" leader={leaders.mostConsistent} format={(v) => `${v}%`} />
          <LeaderRow icon="📖" title="Most pages" leader={leaders.mostPages} format={(v) => `${n(v)} pages`} />
          <LeaderRow icon="⏱️" title="Most minutes" leader={leaders.mostMinutes} format={(v) => `${n(v)} minutes`} />
          <LeaderRow icon="📑" title="Most chapters" leader={leaders.mostChapters} format={(v) => `${n(v)} chapters`} />
          <LeaderRow icon="📚" title="Books completed" leader={leaders.booksCompleted} format={(v) => `${v} book${v === 1 ? "" : "s"}`} />
        </ul>
      ) : (
        <p className="mt-3 text-ink-2">Stats appear after the first check-ins. 📚</p>
      )}
      <p className="mt-3 text-xs text-muted">Pages, chapters and minutes are never mixed into one score. Everyone&apos;s goal is different.</p>
    </Card>
  );
}
