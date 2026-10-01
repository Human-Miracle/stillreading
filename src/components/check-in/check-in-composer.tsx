"use client";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { addDays, isWithinChallenge } from "@/lib/domain/dates";
import { defaultSessionUnit, formatAmount } from "@/lib/domain/goals";
import type { SessionUnit } from "@/lib/domain/types";
import type { ChallengeView } from "@/local/hooks";
import { addBook, logReading, updateBook } from "@/local/repo";
import { useSyncState } from "@/local/hooks";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Field, Input, Textarea } from "../ui/field";
import { Segmented } from "../ui/segmented";
import { Sheet } from "../ui/sheet";

const QUICK: Record<SessionUnit, number[]> = { pages: [10, 20, 30], chapters: [1, 2, 3], minutes: [15, 30, 45] };
const NEW_BOOK = "__new__";
const NO_BOOK = "__none__";

interface Logged {
  amount: number;
  unit: SessionUnit;
  bookTitle: string | null;
  offline: boolean;
}

export function CheckInComposer({ view, open, onClose }: { view: ChallengeView; open: boolean; onClose: () => void }) {
  if (!view.me) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Log reading">
      {/* Mounted only while open, so every check-in starts from a fresh form. */}
      {open ? <ComposerBody view={view} onClose={onClose} /> : null}
    </Sheet>
  );
}

function ComposerBody({ view, onClose }: { view: ChallengeView; onClose: () => void }) {
  const me = view.me!;
  const sync = useSyncState();
  const myBooks = (me.books ?? [])
    .filter((b) => b.status !== "abandoned")
    .sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed"));
  const [bookId, setBookId] = useState<string>(() => me.currentBook?.id ?? myBooks[0]?.id ?? NO_BOOK);
  const [newTitle, setNewTitle] = useState("");
  const [unit, setUnit] = useState<SessionUnit>(() => defaultSessionUnit(me.goal));
  const [amount, setAmount] = useState("");
  const [reflection, setReflection] = useState("");
  const [shared, setShared] = useState(true);
  const [finished, setFinished] = useState(false);
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logged, setLogged] = useState<Logged | null>(null);

  const yesterday = addDays(view.today, -1);
  const canYesterday = me.progress.clock.phase === "active" && isWithinChallenge(view.challenge, yesterday) && yesterday >= me.progress.effectiveStart;
  const remaining = me.progress.today.target !== null && me.goal?.targetUnit === unit ? me.progress.today.remaining : 0;
  const quick = Array.from(new Set([...(remaining > 0 ? [remaining] : []), ...QUICK[unit]])).slice(0, 4);
  const selectedBook = myBooks.find((b) => b.id === bookId);

  const submit = async () => {
    const value = Number.parseInt(amount, 10);
    if (!Number.isFinite(value) || value <= 0) return setError("How much did you read? Enter a number above 0.");
    if (value > 10_000) return setError("That's a lot! Please enter 10,000 or less.");
    if (bookId === NEW_BOOK && !newTitle.trim()) return setError("Add the book title, or choose “No book”.");
    setError(null);
    setSaving(true);
    const wasMet = me.progress.today.goalMet;
    try {
      let useBookId: string | null = bookId === NO_BOOK ? null : bookId;
      let title = selectedBook?.title ?? null;
      if (bookId === NEW_BOOK) {
        const book = await addBook(view.challenge.id, { title: newTitle.trim() });
        useBookId = book.id;
        title = book.title;
        track("book_added", { challengeId: view.challenge.id });
      }
      await logReading({
        challengeId: view.challenge.id,
        bookId: useBookId,
        amount: value,
        unit,
        reflection,
        reflectionShared: shared,
        date: day === "yesterday" ? yesterday : view.today,
      });
      if (finished && useBookId) await updateBook(useBookId, { status: "completed" });
      track("reading_logged", { challengeId: view.challenge.id, props: { unit, hasReflection: Boolean(reflection.trim()) } });
      if (!wasMet && day === "today") track("reading_goal_completed", { challengeId: view.challenge.id });
      setLogged({ amount: value, unit, bookTitle: title, offline: !sync.online });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {logged ? (
        <Success view={view} logged={logged} onClose={onClose} />
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {canYesterday ? (
            <Segmented
              label="Which day?"
              value={day}
              onChange={setDay}
              options={[
                { value: "today", label: "Today" },
                { value: "yesterday", label: "Yesterday" },
              ]}
            />
          ) : null}

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink-2">What did you read?</legend>
            <div className="-mx-1 flex flex-wrap gap-2 px-1">
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
              <div className="mt-3">
                <Field label="Book title">
                  {(p) => <Input {...p} autoFocus maxLength={200} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="The Creative Act" />}
                </Field>
              </div>
            ) : null}
          </fieldset>

          <div className="space-y-3">
            <label htmlFor="checkin-amount" className="block text-sm font-semibold text-ink-2">
              How much?
            </label>
            <div className="flex items-stretch gap-3">
              <input
                id="checkin-amount"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 5))}
                className="tabular w-0 min-w-0 flex-1 rounded-field border border-line bg-card px-4 py-2 text-center font-display text-5xl font-semibold focus:border-accent focus:outline-none"
                aria-describedby="checkin-unit"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {quick.map((q) => (
                <Chip key={q} active={amount === String(q)} onClick={() => setAmount(String(q))}>
                  {q === remaining ? `${q} · finishes today's goal` : q}
                </Chip>
              ))}
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
            </div>
            {me.goal && me.goal.targetUnit !== "days" && me.goal.targetUnit !== "books" && me.goal.targetUnit !== unit ? (
              <p className="text-sm text-muted">Your goal is in {me.goal.targetUnit}, so this counts as a reading day but not toward your {me.goal.targetUnit}.</p>
            ) : null}
          </div>

          <Field label="What stood out? (optional)">
            {(p) => <Textarea {...p} maxLength={500} placeholder="The identity chapter was so good." value={reflection} onChange={(e) => setReflection(e.target.value)} />}
          </Field>
          <div className="space-y-2">
            {reflection.trim() ? <Toggle checked={shared} onChange={setShared} label="Share my reflection with the crew" /> : null}
            {bookId !== NO_BOOK && (bookId === NEW_BOOK || selectedBook?.status !== "completed") ? (
              <Toggle checked={finished} onChange={setFinished} label="I finished this book 🎉" />
            ) : null}
          </div>

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" full disabled={saving}>
            {saving ? "Saving…" : "CHECK IN"}
          </Button>
        </form>
      )}
    </>
  );
}

function Success({ view, logged, onClose }: { view: ChallengeView; logged: Logged; onClose: () => void }) {
  const p = view.me?.progress;
  const goal = view.me?.goal;
  let message = "Every page counts. See you tomorrow.";
  if (p && goal) {
    if (p.today.goalMet) message = p.streak.current > 1 ? `Today's goal is done. 🔥 ${p.streak.current} day streak!` : "Today's goal is done. Nice work!";
    else if (p.today.target !== null && p.today.remaining > 0) message = `You're ${formatAmount(p.today.remaining, goal.targetUnit)} away from today's goal.`;
  }
  return (
    <div className="space-y-5 pb-2 text-center" role="status">
      <div className="mx-auto grid size-20 animate-pop place-items-center rounded-full bg-success-soft text-4xl text-success" aria-hidden>
        ✓
      </div>
      <div>
        <p className="font-display text-2xl font-semibold">{logged.offline ? "Saved on this device" : "Reading logged"}</p>
        <p className="mt-1 text-lg text-ink-2">
          {formatAmount(logged.amount, logged.unit)}
          {logged.bookTitle ? ` · ${logged.bookTitle}` : ""}
        </p>
      </div>
      <p className="text-ink-2">{message}</p>
      {logged.offline ? <p className="text-sm text-muted">We&apos;ll sync when you&apos;re back online.</p> : null}
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
        "max-w-full truncate rounded-pill border px-4 py-2 text-sm font-semibold transition-colors min-h-10",
        active ? "border-accent bg-accent text-accent-ink" : "border-line bg-card text-ink-2 hover:border-muted/50",
      )}
    >
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl bg-paper-2 px-4 py-2.5 text-sm font-medium">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[var(--accent)]" />
      {label}
    </label>
  );
}
