"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BookDetails } from "@/components/books/book-card";
import { BookShelf } from "@/components/books/book-shelf";
import { Sheet } from "@/components/ui/sheet";
import type { LocalBook } from "@/local/db";
import { useChallenge } from "@/components/challenge/context";
import { DayRing } from "@/components/challenge/day-ring";
import { GoalProgress } from "@/components/challenge/goal-progress";
import { Hero, type HeroTone } from "@/components/challenge/hero";
import { StreakBanner } from "@/components/challenge/streak-banner";
import { ReadingFeed } from "@/components/feed/reading-feed";
import { Avatar, tintFor } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow, PageSheet } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { amountSummary, streakBanner } from "@/lib/copy";

const HERO_FOR: Record<string, HeroTone> = { butter: "honey", sage: "sky", blush: "blush", lavender: "lavender", sky: "sky" };

export default function ParticipantPage() {
  const { participantId } = useParams<{ participantId: string }>();
  const { view } = useChallenge();
  const member = view.members.find((m) => m.participant.id === participantId);
  const [openBook, setOpenBook] = useState<LocalBook | null>(null);
  const back = { href: `/c/${view.challenge.id}/people`, label: "Back to people" };
  if (!member) {
    return (
      <>
        <Hero tone="paper" title="Reader" back={back} />
        <div className="px-5 pt-8">
          <EmptyState title="This reader isn't in the challenge anymore">
            <ButtonLink href={back.href} size="sm" className="mt-3">
              Back to people
            </ButtonLink>
          </EmptyState>
        </div>
      </>
    );
  }
  const p = member.progress;
  const isMe = member.participant.id === view.challenge.myParticipantId;
  const others = view.members.filter((m) => m !== member).map((m) => m.progress.streak.current);
  const banner = streakBanner(p, others, view.challenge.durationDays);
  const sessions = view.feed.filter((s) => s.participantId === participantId);
  // Reading now first, then up next, then finished.
  const order = { reading: 0, planned: 1, completed: 2, abandoned: 3 } as const;
  const books = [...member.books].sort((a, b) => order[a.status] - order[b.status] || b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <Hero tone={HERO_FOR[tintFor(member.participant.id)] ?? "lavender"} title={member.participant.displayName} subtitle={isMe ? "You" : view.challenge.name} back={back} className="pb-14">
        <div className="px-5 pt-6">
          <div className="flex items-center gap-4">
            <Avatar name={member.participant.displayName} id={member.participant.id} size="xl" className="ring-4 ring-white/60" />
            <div className="min-w-0">
              <h1 className="display truncate text-[44px]">{member.participant.displayName}</h1>
              <p className="mt-1 truncate text-ink/60">{member.currentBook ? `Reading ${member.currentBook.title}` : "No book yet"}</p>
            </div>
          </div>
          <StreakBanner className="mt-6" title={
              isMe
                ? banner.title
                : p.streak.current >= 2
                  ? `${p.streak.current} days without a break`
                  : p.streak.current === 1
                    ? p.today.goalMet
                      ? "Started a streak today"
                      : "Read yesterday, streak of one"
                    : "No streak right now"
            } sub={isMe ? banner.sub : p.today.read ? `${amountSummary(p.today.totals)} today` : "Hasn't checked in yet today"} />
          <div className="pt-4">
            <DayRing progress={p} durationDays={view.challenge.durationDays} size={280}>
              <div>
                <p className="display text-[72px] tabular">{p.readingDays}</p>
                <p className="mt-1 text-sm text-ink/55">reading days of {p.days.length}</p>
              </div>
            </DayRing>
          </div>
        </div>
      </Hero>
      <PageSheet className="space-y-4">
        <section aria-labelledby="their-books" className="pb-1">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="their-books" className="headline text-[22px]">
              {isMe ? "Your books" : "Books"}
            </h2>
            <p className="text-sm text-muted">
              {books.length} book{books.length === 1 ? "" : "s"} · {p.booksCompleted} finished
            </p>
          </div>
          {books.length ? (
            <BookShelf books={books} onOpen={setOpenBook} ledge="light" />
          ) : (
            <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-ink/60">{isMe ? "You haven't added a book yet." : `${member.participant.displayName} hasn't added a book yet.`}</p>
          )}
        </section>
        <div className="grid grid-cols-2 gap-3">
          <Card tone="muted" pad="sm">
            <Eyebrow>Longest streak</Eyebrow>
            <p className="display mt-2 text-[40px] tabular">{p.streak.longest}</p>
            <p className="text-xs text-muted">day{p.streak.longest === 1 ? "" : "s"}</p>
          </Card>
          <Card tone="muted" pad="sm">
            <Eyebrow>Consistency</Eyebrow>
            <p className="display mt-2 text-[40px] tabular">{p.consistency.display}%</p>
            <p className="text-xs text-muted">{p.goalDays} goal days</p>
          </Card>
        </div>
        <GoalProgress me={member} title="Goal" tint={tintFor(member.participant.id)} />
        <div className="pt-2">
          <h2 className="headline mb-1 text-[22px]">Recent reading</h2>
          {sessions.length ? <ReadingFeed view={view} sessions={sessions.slice(0, 20)} showEmpty={false} /> : <EmptyState title="No check-ins yet" />}
        </div>
      </PageSheet>
      <Sheet open={openBook !== null} onClose={() => setOpenBook(null)} title="Book">
        {openBook ? <BookDetails book={books.find((b) => b.id === openBook.id) ?? openBook} editable={false} /> : null}
      </Sheet>
    </>
  );
}
