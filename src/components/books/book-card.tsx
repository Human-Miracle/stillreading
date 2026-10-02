"use client";
import { useState } from "react";
import type { LocalBook } from "@/local/db";
import { removeBook, updateBook } from "@/local/repo";
import { Button } from "../ui/button";
import { ProgressBar } from "../ui/progress";
import { BookCover } from "./book-cover";
import { BookForm, bookDraftReady, bookDraftToInput, bookToDraft, type BookDraft } from "./book-form";

export const STATUS_LABEL = { planned: "Up next", reading: "Reading", completed: "Finished", abandoned: "Set aside" } as const;

/** Book details + actions, shown inside a sheet. */
export function BookDetails({ book, editable, onDone }: { book: LocalBook; editable: boolean; onDone?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<BookDraft | null>(null);
  const pct = book.totalPages ? (book.currentPage / book.totalPages) * 100 : null;
  const act = async (fn: () => Promise<void>) => {
    await fn();
    onDone?.();
  };
  if (draft) {
    return (
      <form
        className="space-y-5"
        aria-label={`Edit ${book.title}`}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!bookDraftReady(draft)) return;
          const input = bookDraftToInput(draft);
          await updateBook(book.id, input);
          setDraft(null);
        }}
      >
        <BookForm value={draft} onChange={setDraft} autoFocus />
        <div className="flex gap-2">
          <Button type="submit" disabled={!bookDraftReady(draft)}>
            Save changes
          </Button>
          <Button variant="ghost" onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }
  return (
    <div className="space-y-5">
      <div className="flex gap-4">
        <BookCover book={book} className="w-24 shrink-0" />
        <div className="min-w-0 pt-1">
          <p className="eyebrow">{STATUS_LABEL[book.status]}</p>
          <p className="headline mt-1 text-[24px]">{book.title}</p>
          {book.author ? <p className="mt-1 text-sm text-muted">{book.author}</p> : null}
        </div>
      </div>
      {pct !== null ? (
        <div className="space-y-1.5">
          <ProgressBar value={pct} label={`${book.title} progress`} tint={book.status === "completed" ? "sage" : "lavender"} />
          <p className="text-xs tabular text-muted">
            Page {book.currentPage} of {book.totalPages}
          </p>
        </div>
      ) : null}
      {editable ? (
        <div className="flex flex-wrap gap-2">
          {book.status !== "completed" ? (
            <Button onClick={() => act(() => updateBook(book.id, { status: "completed" }))}>Mark finished</Button>
          ) : (
            <Button variant="secondary" onClick={() => act(() => updateBook(book.id, { status: "reading" }))}>
              Still reading
            </Button>
          )}
          {book.status === "planned" ? (
            <Button variant="secondary" onClick={() => act(() => updateBook(book.id, { status: "reading" }))}>
              Start reading
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => setDraft(bookToDraft(book))}>
            Edit details
          </Button>
          {confirming ? (
            <Button variant="danger" onClick={() => act(() => removeBook(book.id))}>
              Remove for sure?
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Remove
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
