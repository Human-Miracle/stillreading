"use client";
import type { LocalBook } from "@/local/db";
import { Icon } from "../ui/icons";
import { BookCover } from "./book-cover";

/** Horizontal shelf of covers on a frosted ledge (reference: the design-books shelf). */
export function BookShelf({
  books,
  onOpen,
  onAdd,
  ledge = "glass",
}: {
  books: LocalBook[];
  onOpen: (book: LocalBook) => void;
  onAdd?: () => void;
  /** "glass" over coloured heroes, "light" on white sheets. */
  ledge?: "glass" | "light";
}) {
  return (
    <div className="relative">
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-14 rounded-xl ${ledge === "light" ? "bg-surface-2" : "bg-white/35 backdrop-blur-[2px]"}`} aria-hidden />
      <ul className="no-scrollbar relative -mx-5 flex gap-3.5 overflow-x-auto px-5 pb-5">
        {books.map((b) => (
          <li key={b.id} className="w-[6.5rem] shrink-0">
            <button type="button" onClick={() => onOpen(b)} className="block w-full transition-transform active:scale-95" aria-label={`${b.title}${b.status === "completed" ? ", finished" : ""}`}>
              <BookCover book={b} />
            </button>
          </li>
        ))}
        {onAdd ? (
          <li className="w-[6.5rem] shrink-0">
            <button
              type="button"
              onClick={onAdd}
              className="grid aspect-[2/3] w-full place-items-center rounded-md border border-dashed border-ink/30 text-ink/60 transition-colors hover:bg-white/30"
              aria-label="Add a book"
            >
              <span className="flex flex-col items-center gap-1 text-xs">
                <Icon.plus />
                Add book
              </span>
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
