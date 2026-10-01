"use client";
import Link from "next/link";
import { useState } from "react";
import type { ChallengeView } from "@/local/hooks";
import { STATUS_LABEL } from "../books/book-card";
import { BookCover } from "../books/book-cover";
import { Avatar } from "../ui/avatar";
import { cn } from "../ui/cn";
import { Sheet } from "../ui/sheet";

const ORDER = { reading: 0, planned: 1, completed: 2, abandoned: 3 } as const;

/** Every book in the challenge and who's reading it, behind a quiet pill in the feed header. */
export function CrewBooks({ view }: { view: ChallengeView }) {
  const [open, setOpen] = useState(false);
  const rows = view.members
    .flatMap((m) => m.books.map((book) => ({ book, member: m })))
    .sort((a, b) => ORDER[a.book.status] - ORDER[b.book.status] || b.book.updatedAt.localeCompare(a.book.updatedAt));
  if (!rows.length) return null;
  const reading = rows.filter((r) => r.book.status === "reading").length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-white/10 px-3 text-sm text-white/80 transition-colors hover:bg-white/15"
      >
        <span aria-hidden>📚</span> What everyone&apos;s reading
        <span className="text-white/45 tabular">· {rows.length}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="What everyone's reading">
        <p className="-mt-2 mb-2 text-sm text-muted">
          {reading} reading now · {rows.length} book{rows.length === 1 ? "" : "s"} in this challenge
        </p>
        <ul>
          {rows.map(({ book, member }) => (
            <li key={book.id} className="dotted">
              <Link href={`/c/${view.challenge.id}/people/${member.participant.id}`} onClick={() => setOpen(false)} className="flex items-center gap-3.5 py-3.5">
                <BookCover book={book} className="w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium tracking-[-0.01em]">{book.title}</p>
                  {book.author ? <p className="truncate text-sm text-muted">{book.author}</p> : null}
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-ink/60">
                    <Avatar name={member.participant.displayName} id={member.participant.id} size="xs" />
                    <span className="truncate">{member.participant.id === view.challenge.myParticipantId ? "You" : member.participant.displayName}</span>
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-medium",
                    book.status === "reading" ? "bg-butter" : book.status === "completed" ? "bg-sage/50" : "bg-surface-2 text-muted",
                  )}
                >
                  {STATUS_LABEL[book.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
