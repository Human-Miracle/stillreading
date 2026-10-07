"use client";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { addDays, diffDays } from "@/lib/domain/dates";
import { formatCountdown } from "@/lib/domain/day-one";
import { defaultSessionUnit, formatAmount, formatSession, unitLabel } from "@/lib/domain/goals";
import type { SessionUnit } from "@/lib/domain/types";
import type { ChallengeView } from "@/local/hooks";
import { addBook, logReading, updateBook } from "@/local/repo";
import { useSyncState } from "@/local/hooks";
import { useDayOneWindow } from "../challenge/day-one";
import { ReplyNotifyPrompt } from "../notifications/reply-notifications";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Field, Input, Textarea } from "../ui/field";
import { Icon } from "../ui/icons";
import { Segmented } from "../ui/segmented";
import { Sheet } from "../ui/sheet";

const QUICK: Record<SessionUnit, number[]> = { pages: [10, 20, 30], chapters: [1, 2, 3], minutes: [15, 30, 45] };
const NEW_BOOK = "__new__";
const NO_BOOK = "__none__";

interface Logged {
  amount: number;
  unit: SessionUnit;
  pages: number | null;
  bookTitle: string | null;
  offline: boolean;
  timeStone: boolean;
  /** Logged for Day 1 through the Day One window. */
  dayOne: boolean;
}

/** "dayOne" logs for Day 1 while the host's Day One window is open. */
export type CheckInDay = "today" | "yesterday" | "dayOne";

export function CheckInComposer({ view, open, day = "today", onClose }: { view: ChallengeView; open: boolean; day?: CheckInDay; onClose: () => void }) {
  if (!view.me) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Log reading">
      {/* Mounted only while open, so every check-in starts from a fresh form. */}
      {open ? <ComposerBody view={view} initialDay={day} onClose={onClose} /> : null}
    </Sheet>
  );
}

function ComposerBody({ view, initialDay, onClose }: { view: ChallengeView; initialDay: CheckInDay; onClose: () => void }) {
  const me = view.me!;
  const sync = useSyncState();
  const myBooks = me.books
    .filter((b) => b.status !== "abandoned")
    .sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed"));
  const [bookId, setBookId] = useState<string>(() => me.currentBook?.id ?? myBooks[0]?.id ?? NO_BOOK);
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [unit, setUnit] = useState<SessionUnit>(() => defaultSessionUnit(me.goal));
  const [amount, setAmount] = useState("");
  const [pages, setPages] = useState("");
  const [reflection, setReflection] = useState("");
  const [shared, setShared] = useState(true);
  const [finished, setFinished] = useState(false);
  const stones = view.timeStones;
  // Yesterday is offered while it's free (just after midnight, or it already has a check-in), or
  // when a Time Stone can bring it back.
  const yesterdayCost = stones?.yesterdayCost ?? null;
  const canYesterday = yesterdayCost === "free" || (yesterdayCost === "stone" && (stones?.wallet.held ?? 0) > 0);
  // While the Day One window is open (Day 3 onward), anyone can log for Day 1.
  const dayOneWindow = useDayOneWindow(view.challenge);
  const day1 = view.challenge.startDate;
  const canDayOne = me.progress.clock.phase === "active" && dayOneWindow.state === "open" && diffDays(day1, view.today) >= 2;
  const [day, setDay] = useState<CheckInDay>(() =>
    initialDay === "dayOne" && canDayOne ? "dayOne" : initialDay === "yesterday" && canYesterday ? "yesterday" : "today",
  );
  const spendsStone = day === "yesterday" && yesterdayCost === "stone";
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logged, setLogged] = useState<Logged | null>(null);

  const yesterday = stones?.yesterday ?? addDays(view.today, -1);
  const remaining = me.progress.today.target !== null && me.goal?.targetUnit === unit ? me.progress.today.remaining : 0;
  const quick = Array.from(new Set([...(remaining > 0 ? [remaining] : []), ...QUICK[unit]])).slice(0, 4);
  const selectedBook = myBooks.find((b) => b.id === bookId);

  const submit = async () => {
    const value = Number.parseInt(amount, 10);
    if (!Number.isFinite(value) || value <= 0) return setError("How much did you read? Enter a number above 0.");
    if (value > 10_000) return setError("That's a lot! Please enter 10,000 or less.");
    const pageCount = unit === "pages" ? null : Number.parseInt(pages, 10);
    if (pageCount !== null && (!Number.isFinite(pageCount) || pageCount <= 0)) {
      return setError(`How many pages did those ${unit} cover? Pages are how everyone is compared on the leaderboard.`);
    }
    if (pageCount !== null && pageCount > 10_000) return setError("That's a lot of pages! Please enter 10,000 or less.");
    if (bookId === NEW_BOOK && (!newTitle.trim() || !newAuthor.trim())) return setError("Add the book’s title and author (they’re how we find its cover), or choose “No book”.");
    if (day === "dayOne" && !canDayOne) return setError("The Day One window has closed. Choose another day.");
    setError(null);
    setSaving(true);
    const wasMet = me.progress.today.goalMet;
    try {
      let useBookId: string | null = bookId === NO_BOOK ? null : bookId;
      let title = selectedBook?.title ?? null;
      if (bookId === NEW_BOOK) {
        const book = await addBook(view.challenge.id, { title: newTitle.trim(), author: newAuthor.trim() });
        useBookId = book.id;
        title = book.title;
        track("book_added", { challengeId: view.challenge.id });
      }
      await logReading({
        challengeId: view.challenge.id,
        bookId: useBookId,
        amount: value,
        unit,
        pages: pageCount,
        reflection,
        reflectionShared: shared,
        date: day === "dayOne" ? day1 : day === "yesterday" ? yesterday : view.today,
        timeStone: spendsStone,
      });
      if (finished && useBookId) await updateBook(useBookId, { status: "completed" });
      track("reading_logged", { challengeId: view.challenge.id, props: { unit, hasReflection: Boolean(reflection.trim()), timeStone: spendsStone } });
      if (!wasMet && day === "today") track("reading_goal_completed", { challengeId: view.challenge.id });
      setLogged({ amount: value, unit, pages: pageCount, bookTitle: title, offline: !sync.online, timeStone: spendsStone, dayOne: day === "dayOne" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (logged) return <Success view={view} logged={logged} onClose={onClose} />;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {canYesterday || canDayOne || day === "dayOne" ? (
        <Segmented
          label="Which day?"
          value={day}
          onChange={setDay}
          options={[
            { value: "today", label: "Today" },
            ...(canYesterday ? [{ value: "yesterday" as const, label: yesterdayCost === "stone" ? "Yesterday ⏳" : "Yesterday" }] : []),
            ...(canDayOne || day === "dayOne" ? [{ value: "dayOne" as const, label: "Day 1" }] : []),
          ]}
        />
      ) : null}
      {day === "dayOne" ? (
        <p className="-mt-3 text-center text-sm text-muted" role="status">
          Day One window closes in <span className="tabular font-medium text-ink">{formatCountdown(dayOneWindow.msLeft)}</span>
        </p>
      ) : null}
      {spendsStone && stones ? (
        <div className="flex gap-3 rounded-[1.25rem] bg-lavender/60 px-4 py-3 text-left" role="note">
          <span className="text-xl leading-none" aria-hidden>
            ⏳
          </span>
          <p className="text-sm leading-snug">
            <span className="font-semibold">This uses a Time Stone</span> (you have {stones.wallet.held}). Yesterday will count for your streak, goal and XP.
          </p>
        </div>
      ) : null}
      {yesterdayCost === "stone" && !canYesterday && stones ? (
        <p className="text-sm text-muted" role="note">
          ⏳ Missed yesterday? A Time Stone brings back a missed day. You&apos;ll earn one in {stones.wallet.toNext} more reading day{stones.wallet.toNext === 1 ? "" : "s"}.
        </p>
      ) : null}

      <div className="rounded-[1.75rem] bg-surface-2 px-4 pb-4 pt-5 text-center">
        <label htmlFor="checkin-amount" className="eyebrow">
          How much?
        </label>
        <input
          id="checkin-amount"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 5))}
          className="display tabular block w-full bg-transparent text-center text-[84px] placeholder:text-ink/15 focus:outline-none"
          aria-describedby="checkin-unit"
        />
        <p className="-mt-1 mb-4 text-sm text-muted">{unitLabel(unit, Number(amount) || 0)}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {quick.map((q) => (
            <Chip key={q} active={amount === String(q)} onClick={() => setAmount(String(q))}>
              {q === remaining ? `${q} · finishes today` : `+${q}`}
            </Chip>
          ))}
        </div>
      </div>

      <div id="checkin-unit">
        <Segmented
          label="Unit"
          value={unit}
          onChange={setUnit}
          options={[
            { value: "pages", label: "Pages" },
            { value: "chapters", label: "Chapters" },
            { value: "minutes", label: "Minutes" },
          ]}
        />
        {me.goal && me.goal.targetUnit !== "days" && me.goal.targetUnit !== "books" && me.goal.targetUnit !== unit ? (
          <p className="mt-2 text-sm text-muted">
            {me.goal.targetUnit === "pages"
              ? "The pages you enter below count toward your pages goal."
              : `Your goal is in ${me.goal.targetUnit}, so this counts as a reading day but not toward your ${me.goal.targetUnit}.`}
          </p>
        ) : null}
      </div>

      {unit !== "pages" ? (
        <Field label={`How many pages did those ${unit} cover?`} hint="Chapters and reading time vary from book to book, so the leaderboard compares everyone by pages.">
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder={unit === "chapters" ? "25" : "15"}
              value={pages}
              onChange={(e) => setPages(e.target.value.replace(/\D/g, "").slice(0, 5))}
              className="bg-surface-2 shadow-none"
            />
          )}
        </Field>
      ) : null}

      <fieldset>
        <legend className="mb-2.5 text-sm font-medium text-ink-2">What did you read?</legend>
        <div className="flex flex-wrap gap-2">
          {myBooks.map((b) => (
            <Chip key={b.id} active={bookId === b.id} onClick={() => setBookId(b.id)}>
              {b.title}
            </Chip>
          ))}
          <Chip active={bookId === NEW_BOOK} onClick={() => setBookId(NEW_BOOK)}>
            + New book
          </Chip>
          <Chip active={bookId === NO_BOOK} onClick={() => setBookId(NO_BOOK)}>
            No book
          </Chip>
        </div>
        {bookId === NEW_BOOK ? (
          <div className="mt-3 space-y-3">
            <Field label="Book title">
              {(p) => <Input {...p} autoFocus maxLength={200} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="The Creative Act" />}
            </Field>
            <Field label="Author">
              {(p) => <Input {...p} autoComplete="off" maxLength={120} value={newAuthor} onChange={(e) => setNewAuthor(e.target.value)} placeholder="Rick Rubin" />}
            </Field>
          </div>
        ) : null}
      </fieldset>

      <Field label="What stood out? (optional)">
        {(p) => <Textarea {...p} className="bg-surface-2 shadow-none" maxLength={500} placeholder="The identity chapter was so good." value={reflection} onChange={(e) => setReflection(e.target.value)} />}
      </Field>
      <div className="space-y-2">
        {reflection.trim() ? <Toggle checked={shared} onChange={setShared} label="Share my reflection with the crew" /> : null}
        {bookId !== NO_BOOK && (bookId === NEW_BOOK || selectedBook?.status !== "completed") ? <Toggle checked={finished} onChange={setFinished} label="I finished this book" /> : null}
      </div>

      {error ? (
        <p className="text-sm text-[#c2321f]" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" full disabled={saving}>
        {saving ? "Saving…" : "Check in"}
      </Button>
    </form>
  );
}

function Success({ view, logged, onClose }: { view: ChallengeView; logged: Logged; onClose: () => void }) {
  const p = view.me?.progress;
  const goal = view.me?.goal;
  let message = "Every page counts. See you tomorrow.";
  if (logged.timeStone) message = "Time Stone used ⏳ Yesterday is back in your streak.";
  else if (logged.dayOne) message = "Day 1 is in. The Day One badge is yours.";
  else if (p && goal) {
    if (p.today.goalMet) message = p.streak.current > 1 ? `Today's goal is done. ${p.streak.current} days without a break.` : "Today's goal is done. Nice work.";
    else if (p.today.target !== null && p.today.remaining > 0) message = `You're ${formatAmount(p.today.remaining, goal.targetUnit)} away from today's goal.`;
  }
  return (
    <div className="space-y-6 pb-2 pt-2 text-center" role="status">
      <div className="mx-auto grid size-24 animate-pop place-items-center rounded-full bg-sage text-ink" aria-hidden>
        <Icon.check className="size-10" strokeWidth={2} />
      </div>
      <div>
        <p className="headline text-[32px]">{logged.offline ? "Saved on this device" : "Reading logged"}</p>
        <p className="mt-1 text-lg text-ink/60">
          {formatSession(logged)}
          {logged.bookTitle ? ` · ${logged.bookTitle}` : ""}
        </p>
      </div>
      <p className="text-ink-2">{message}</p>
      {logged.offline ? <p className="text-sm text-muted">We&apos;ll sync when you&apos;re back online.</p> : <ReplyNotifyPrompt challengeId={view.challenge.id} />}
      <Button full size="lg" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-10 max-w-full truncate rounded-pill px-4 text-sm font-medium transition-colors",
        active ? "bg-ink text-white" : "bg-surface text-ink-2 shadow-soft hover:bg-white/70",
      )}
    >
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 text-sm font-medium">
      {label}
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-ink/15 transition-colors peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-focus after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}
