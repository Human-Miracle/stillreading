"use client";
import { useState } from "react";
import type { LocalBook } from "@/local/db";
import { removeBook, updateBook } from "@/local/repo";
import { Button } from "../ui/button";
import { ProgressBar } from "../ui/progress";

const STATUS_LABEL = { planned: "Up next", reading: "Reading", completed: "Finished", abandoned: "Set aside" } as const;

export function BookCard({ book, editable }: { book: LocalBook; editable: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const pct = book.totalPages ? (book.currentPage / book.totalPages) * 100 : null;
  return (
    <li className="rounded-card border border-line/60 bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-snug">{book.title}</p>
          {book.author ? <p className="text-sm text-muted">{book.author}</p> : null}
        </div>
        <span className={book.status === "completed" ? "rounded-pill bg-success-soft px-2.5 py-1 text-xs font-bold text-success" : "rounded-pill bg-paper-2 px-2.5 py-1 text-xs font-bold text-muted"}>
          {STATUS_LABEL[book.status]}
        </span>
      </div>
      {pct !== null ? (
        <div className="mt-3 space-y-1">
          <ProgressBar value={pct} label={`${book.title} progress`} tone={book.status === "completed" ? "success" : "accent"} />
          <p className="text-xs text-muted tabular">
            Page {book.currentPage} of {book.totalPages}
          </p>
        </div>
      ) : null}
      {editable ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {book.status !== "completed" ? (
            <Button size="sm" variant="secondary" onClick={() => void updateBook(book.id, { status: "completed" })}>
              Mark finished 🎉
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => void updateBook(book.id, { status: "reading" })}>
              Still reading
            </Button>
          )}
          {book.status === "planned" ? (
            <Button size="sm" variant="ghost" onClick={() => void updateBook(book.id, { status: "reading" })}>
              Start reading
            </Button>
          ) : null}
          {confirming ? (
            <Button size="sm" variant="danger" onClick={() => void removeBook(book.id)}>
              Remove for sure?
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              Remove
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}
