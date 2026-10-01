"use client";
import { useState } from "react";
import { useChallenge } from "@/components/challenge/context";
import { GoalProgress } from "@/components/challenge/goal-progress";
import { BookCard } from "@/components/books/book-card";
import { BookForm, bookDraftToInput, emptyBook } from "@/components/books/book-form";
import { DayGrid } from "@/components/people/day-grid";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { amountSummary } from "@/lib/copy";
import { formatAmount } from "@/lib/domain/goals";
import { relativeDayLabel } from "@/lib/format";
import { track } from "@/lib/analytics";
import { addBook, deleteSession } from "@/local/repo";

export default function MePage() {
  const { view, openCheckIn } = useChallenge();
  const me = view.me;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyBook);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  if (!me) return null;
  const p = me.progress;
  const editable = view.challenge.status !== "archived";
  const mySessions = view.feed.filter((s) => s.participantId === me.participant.id);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-semibold">Your progress</h1>
      <GoalProgress me={me} />
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Current streak", value: `${p.streak.current}`, sub: `longest ${p.streak.longest}` },
          { label: "Consistency", value: `${p.consistency.display}%`, sub: `${p.goalDays} goal days` },
          { label: "Reading days", value: `${p.readingDays}`, sub: `of ${p.days.length} so far` },
          { label: "Books finished", value: `${p.booksCompleted}`, sub: amountSummary(p.totals) },
        ].map((s) => (
          <Card key={s.label} pad="sm">
            <Eyebrow>{s.label}</Eyebrow>
            <p className="mt-1 font-display text-3xl font-semibold tabular">{s.value}</p>
            <p className="truncate text-sm text-muted">{s.sub}</p>
          </Card>
        ))}
      </div>

      <Card>
        <Eyebrow className="mb-3">Challenge days</Eyebrow>
        <DayGrid progress={p} durationDays={view.challenge.durationDays} />
      </Card>

      <section className="space-y-3" aria-labelledby="books-title">
        <div className="flex items-center justify-between">
          <h2 id="books-title" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            Your books
          </h2>
          {editable && !adding ? (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              + Add book
            </Button>
          ) : null}
        </div>
        {adding ? (
          <Card>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const input = bookDraftToInput(draft);
                if (!input.title) return;
                await addBook(view.challenge.id, input);
                track("book_added", { challengeId: view.challenge.id });
                setDraft(emptyBook);
                setAdding(false);
              }}
            >
              <BookForm value={draft} onChange={setDraft} autoFocus />
              <div className="flex gap-2">
                <Button type="submit" disabled={!draft.title.trim()}>
                  Add book
                </Button>
                <Button variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        ) : null}
        {me.books.length ? (
          <ul className="space-y-3">
            {[...me.books]
              .sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed") || b.updatedAt.localeCompare(a.updatedAt))
              .map((b) => (
                <BookCard key={b.id} book={b} editable={editable} />
              ))}
          </ul>
        ) : !adding ? (
          <EmptyState title="No books yet">Add what you&apos;re reading, or just log pages without one.</EmptyState>
        ) : null}
      </section>

      <section className="space-y-3" aria-labelledby="history-title">
        <h2 id="history-title" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
          Your check-ins
        </h2>
        {mySessions.length ? (
          <ul className="divide-y divide-line rounded-card border border-line/60 bg-card shadow-card">
            {mySessions.slice(0, 60).map((s) => {
              const book = s.bookId ? view.booksById.get(s.bookId) : undefined;
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold tabular">
                      {relativeDayLabel(s.date, view.today)} — {formatAmount(s.amount, s.unit)}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {book?.title ?? "No book"}
                      {s.syncStatus !== "synced" ? ` · ${s.syncStatus === "failed" ? "not synced" : "saved on device"}` : ""}
                    </p>
                  </div>
                  {editable ? (
                    confirmDelete === s.id ? (
                      <Button size="sm" variant="danger" onClick={() => void deleteSession(s.id)}>
                        Delete
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" aria-label={`Remove check-in from ${relativeDayLabel(s.date, view.today)}`} onClick={() => setConfirmDelete(s.id)}>
                        Remove
                      </Button>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No check-ins yet">
            {p.clock.phase === "active" ? (
              <Button className="mt-3" onClick={openCheckIn}>
                Log your first reading
              </Button>
            ) : null}
          </EmptyState>
        )}
      </section>

      {p.clock.phase === "ended" ? (
        <ButtonLink href={`/c/${view.challenge.id}/complete`} full>
          See your recap
        </ButtonLink>
      ) : null}
    </div>
  );
}
