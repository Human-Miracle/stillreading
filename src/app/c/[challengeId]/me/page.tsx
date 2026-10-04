"use client";
import { useState } from "react";
import { BookDetails } from "@/components/books/book-card";
import { BadgeGrid } from "@/components/badges/badge-grid";
import { BookForm, bookDraftReady, bookDraftToInput, emptyBook } from "@/components/books/book-form";
import { BookShelf } from "@/components/books/book-shelf";
import { useChallenge } from "@/components/challenge/context";
import { GoalProgress } from "@/components/challenge/goal-progress";
import { Hero } from "@/components/challenge/hero";
import { StreakBanner } from "@/components/challenge/streak-banner";
import { DayGrid } from "@/components/people/day-grid";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow, PageSheet } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { CountTabs } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { track } from "@/lib/analytics";
import { amountSummary, streakBanner } from "@/lib/copy";
import { formatAmount, formatSession } from "@/lib/domain/goals";
import { relativeDayLabel } from "@/lib/format";
import type { LocalBook } from "@/local/db";
import { addBook, deleteSession } from "@/local/repo";

type Tab = "overview" | "checkins" | "books" | "badges";

export default function MePage() {
  const { view, badges, openCheckIn } = useChallenge();
  const me = view.me;
  const [tab, setTab] = useState<Tab>("overview");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyBook);
  const [openBook, setOpenBook] = useState<LocalBook | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  if (!me) return null;
  const p = me.progress;
  const editable = view.challenge.status !== "archived";
  const mySessions = view.feed.filter((s) => s.participantId === me.participant.id);
  const books = [...me.books].sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed") || b.updatedAt.localeCompare(a.updatedAt));
  const banner = streakBanner(p, view.members.filter((m) => m !== me).map((m) => m.progress.streak.current), view.challenge.durationDays);
  const unit = me.goal && me.goal.targetUnit !== "days" && me.goal.targetUnit !== "books" ? me.goal.targetUnit : null;
  const headline = unit ? formatAmount(p.totals[unit], unit) : amountSummary(p.totals);

  return (
    <>
      <Hero tone="lavender" title="Your progress" subtitle={view.challenge.name} back={{ href: `/c/${view.challenge.id}`, label: "Back to challenge" }} className="pb-14">
        <div className="px-5 pt-6">
          <StreakBanner title={banner.title} sub={banner.sub} />
          <h1 className="display mt-8 text-[54px] leading-[0.98]">
            You&apos;ve read {headline === "—" ? "nothing yet" : headline}
            <span className="text-ink/35"> this challenge</span>
          </h1>
          <div className="mt-8 flex items-center justify-between">
            <p className="text-[17px] font-medium tracking-[-0.02em]">Your books</p>
            <p className="text-sm text-ink/55">
              {books.length} book{books.length === 1 ? "" : "s"} · {p.booksCompleted} finished
            </p>
          </div>
          <div className="mt-3">
            <BookShelf books={books} onOpen={setOpenBook} onAdd={editable ? () => setAdding(true) : undefined} />
          </div>
          <div className="mt-6">
            <CountTabs
              label="Your progress"
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "overview", label: "Overview", count: p.readingDays },
                { value: "checkins", label: "Check-ins", count: mySessions.length },
                { value: "books", label: "Books", count: books.length },
                { value: "badges", label: "Badges", count: badges.mine.filter((b) => b.level > 0).length },
              ]}
            />
          </div>
        </div>
      </Hero>

      <PageSheet className="space-y-4">
        {tab === "overview" ? (
          <>
            <div className="flex items-end justify-between gap-4 pb-2">
              <div>
                <p className="headline text-[22px]">Consistency</p>
                <p className="text-ink/45">{p.goalDays} goal days so far</p>
              </div>
              <p className="display text-[84px] tabular">
                {p.consistency.display}
                <span className="align-top text-2xl text-ink/40">%</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Current streak", value: `${p.streak.current}`, sub: `longest ${p.streak.longest}` },
                { label: "Reading days", value: `${p.readingDays}`, sub: `of ${p.days.length} so far` },
              ].map((s) => (
                <Card key={s.label} tone="muted" pad="sm">
                  <Eyebrow>{s.label}</Eyebrow>
                  <p className="display mt-2 text-[40px] tabular">{s.value}</p>
                  <p className="text-xs text-muted">{s.sub}</p>
                </Card>
              ))}
            </div>
            <GoalProgress me={me} />
            <Card tone="muted">
              <Eyebrow className="mb-3">Challenge days</Eyebrow>
              <DayGrid progress={p} durationDays={view.challenge.durationDays} />
            </Card>
            {p.clock.phase === "ended" ? (
              <ButtonLink href={`/c/${view.challenge.id}/complete`} full>
                See your recap
              </ButtonLink>
            ) : null}
          </>
        ) : null}

        {tab === "checkins" ? (
          mySessions.length ? (
            <ul>
              {mySessions.slice(0, 90).map((s) => {
                const book = s.bookId ? view.booksById.get(s.bookId) : undefined;
                return (
                  <li key={s.id} className="dotted flex items-center gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted">{relativeDayLabel(s.date, view.today)}</p>
                      <p className="mt-0.5 text-[22px] font-medium tracking-[-0.03em] tabular">{formatSession(s)}</p>
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
                <Button className="mt-4" onClick={openCheckIn}>
                  Log your first reading
                </Button>
              ) : null}
            </EmptyState>
          )
        ) : null}

        {tab === "badges" ? <BadgeGrid view={view} badges={badges} participantId={view.challenge.myParticipantId} /> : null}

        {tab === "books" ? (
          books.length ? (
            <ul>
              {books.map((b) => (
                <li key={b.id} className="dotted py-5">
                  <BookDetails book={b} editable={editable} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No books yet">Add what you&apos;re reading, or just log pages without one.</EmptyState>
          )
        ) : null}
      </PageSheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a book">
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!bookDraftReady(draft)) return;
            const input = bookDraftToInput(draft);
            await addBook(view.challenge.id, input);
            track("book_added", { challengeId: view.challenge.id });
            setDraft(emptyBook);
            setAdding(false);
          }}
        >
          <BookForm value={draft} onChange={setDraft} autoFocus />
          <Button type="submit" size="lg" full disabled={!bookDraftReady(draft)}>
            Add book
          </Button>
        </form>
      </Sheet>
      <Sheet open={openBook !== null} onClose={() => setOpenBook(null)} title="Book">
        {openBook ? <BookDetails book={books.find((b) => b.id === openBook.id) ?? openBook} editable={editable} onDone={() => setOpenBook(null)} /> : null}
      </Sheet>
    </>
  );
}
