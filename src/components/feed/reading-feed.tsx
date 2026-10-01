"use client";
import Link from "next/link";
import { useState } from "react";
import { formatAmount } from "@/lib/domain/goals";
import { relativeDayLabel, timeAgo } from "@/lib/format";
import type { LocalSession } from "@/local/db";
import type { ChallengeView } from "@/local/hooks";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/misc";
import { ReactionBar } from "./reaction-bar";

const PAGE = 30;

export function ReadingFeedItem({ view, session }: { view: ChallengeView; session: LocalSession }) {
  const person = view.participantsById.get(session.participantId);
  const book = session.bookId ? view.booksById.get(session.bookId) : undefined;
  const isMine = session.participantId === view.challenge.myParticipantId;
  const showReflection = session.reflection && (session.reflectionShared || !isMine);
  return (
    <li className="rounded-card border border-line/60 bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <Link href={`/c/${view.challenge.id}/people/${session.participantId}`} aria-label={person?.displayName}>
          <Avatar name={person?.displayName ?? "?"} id={session.participantId} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{person?.displayName ?? "Someone"}</span>
            <span className="text-xs text-muted">{timeAgo(session.createdAt)}</span>
            {isMine && session.syncStatus !== "synced" ? (
              <span className="text-xs font-semibold text-warn">{session.syncStatus === "failed" ? "Not synced" : "Saved on device"}</span>
            ) : null}
          </p>
          {book ? <p className="truncate text-sm text-muted">{book.title}</p> : null}
          <p className="mt-1 font-display text-2xl font-semibold tabular">{formatAmount(session.amount, session.unit)}</p>
          {showReflection ? <p className="mt-2 whitespace-pre-line text-ink-2">“{session.reflection}”</p> : null}
          {isMine && session.reflection && !session.reflectionShared ? (
            <p className="mt-2 whitespace-pre-line text-ink-2">
              <span className="mr-1 text-xs font-bold uppercase tracking-wide text-muted">Private</span>“{session.reflection}”
            </p>
          ) : null}
          <div className="mt-3">
            <ReactionBar
              challengeId={view.challenge.id}
              sessionId={session.id}
              reactions={view.reactionsBySession.get(session.id) ?? []}
              myParticipantId={view.challenge.myParticipantId}
              disabled={view.challenge.status === "archived"}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

export function ReadingFeed({ view, sessions = view.feed }: { view: ChallengeView; sessions?: LocalSession[] }) {
  const [limit, setLimit] = useState(PAGE);
  const visible = sessions.slice(0, limit);
  const todayCount = sessions.filter((s) => s.date === view.today).length;

  const groups: { date: string; items: LocalSession[] }[] = [];
  for (const s of visible) {
    const last = groups[groups.length - 1];
    if (last && last.date === s.date) last.items.push(s);
    else groups.push({ date: s.date, items: [s] });
  }
  // Session dates and creation order can differ (logging for yesterday); group by date, newest date first.
  groups.sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      {todayCount === 0 ? (
        <EmptyState title="No one has checked in yet today.">Be the first. 📚</EmptyState>
      ) : null}
      {groups.map((g) => (
        <section key={g.date} aria-label={relativeDayLabel(g.date, view.today)} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            {g.date === view.today ? "Today's reading" : relativeDayLabel(g.date, view.today)}
          </h2>
          <ul className="space-y-3">
            {g.items.map((s) => (
              <ReadingFeedItem key={s.id} view={view} session={s} />
            ))}
          </ul>
        </section>
      ))}
      {sessions.length > limit ? (
        <Button variant="secondary" full onClick={() => setLimit((l) => l + PAGE)}>
          Show older check-ins
        </Button>
      ) : null}
    </div>
  );
}
