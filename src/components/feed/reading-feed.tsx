"use client";
import Link from "next/link";
import { useState } from "react";
import { formatAmount } from "@/lib/domain/goals";
import { relativeDayLabel } from "@/lib/format";
import type { LocalSession } from "@/local/db";
import type { ChallengeView } from "@/local/hooks";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/misc";
import { ReactionBar } from "./reaction-bar";

const PAGE = 30;

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function ReadingFeedItem({ view, session }: { view: ChallengeView; session: LocalSession }) {
  const person = view.participantsById.get(session.participantId);
  const book = session.bookId ? view.booksById.get(session.bookId) : undefined;
  const isMine = session.participantId === view.challenge.myParticipantId;
  const sharedReflection = session.reflection && (session.reflectionShared || !isMine);
  const privateReflection = isMine && session.reflection && !session.reflectionShared;
  return (
    <li className="dotted py-5">
      <div className="flex gap-3.5">
        <Link href={`/c/${view.challenge.id}/people/${session.participantId}`} aria-label={person?.displayName}>
          <Avatar name={person?.displayName ?? "?"} id={session.participantId} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[15px] font-medium tracking-[-0.01em]">
              {person?.displayName ?? "Someone"}
              {book ? <span className="font-normal text-muted"> · {book.title}</span> : null}
            </p>
            <span className="shrink-0 text-xs tabular text-ink/35">{clock(session.createdAt)}</span>
          </div>
          <p className="display mt-1.5 text-[34px] tabular">{formatAmount(session.amount, session.unit)}</p>
          {isMine && session.syncStatus !== "synced" ? (
            <p className="mt-1 text-xs font-medium text-warn">{session.syncStatus === "failed" ? "Not synced" : "Saved on device"}</p>
          ) : null}
          {sharedReflection ? <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink/70">“{session.reflection}”</p> : null}
          {privateReflection ? (
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink/70">
              <span className="mr-1.5 rounded-pill bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">Private</span>“{session.reflection}”
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

export function ReadingFeed({ view, sessions = view.feed, showEmpty = true }: { view: ChallengeView; sessions?: LocalSession[]; showEmpty?: boolean }) {
  const [limit, setLimit] = useState(PAGE);
  const visible = sessions.slice(0, limit);
  const todayCount = sessions.filter((s) => s.date === view.today).length;

  const groups: { date: string; items: LocalSession[] }[] = [];
  for (const s of visible) {
    const g = groups.find((x) => x.date === s.date);
    if (g) g.items.push(s);
    else groups.push({ date: s.date, items: [s] });
  }
  groups.sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      {showEmpty && todayCount === 0 ? <EmptyState title="No one has checked in yet today.">Be the first. 📚</EmptyState> : null}
      {groups.map((g) => (
        <section key={g.date} aria-label={relativeDayLabel(g.date, view.today)}>
          <h2 className="eyebrow">{g.date === view.today ? "Today's reading" : relativeDayLabel(g.date, view.today)}</h2>
          <ul>
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
