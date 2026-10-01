"use client";
import { useEffect } from "react";
import { findCover } from "@/lib/book-search";
import { getLocalDb, type LocalBook } from "@/local/db";
import { updateBook } from "@/local/repo";

const key = (bookId: string) => `sr-cover-checked:${bookId}`;
const inFlight = new Set<string>();

/** Stop looking a cover up automatically, e.g. after the reader removed one on purpose. */
export function markCoverChecked(bookId: string) {
  try {
    localStorage.setItem(key(bookId), "1");
  } catch {
    // Storage unavailable: the in-memory guard still prevents repeat lookups this session.
  }
}

/** Look the cover up again, e.g. after the title was corrected. */
export function clearCoverChecked(bookId: string) {
  try {
    localStorage.removeItem(key(bookId));
  } catch {
    // ignore
  }
}

function wasChecked(bookId: string) {
  try {
    return localStorage.getItem(key(bookId)) === "1";
  } catch {
    return false;
  }
}

/**
 * Finds covers for the reader's own books that don't have one yet (typed in by hand, or added before
 * covers existed) and saves them, which syncs the cover to everyone in the challenge. Each book is
 * looked up once per device; failed lookups (offline, Open Library down) are retried later.
 */
export function useCoverBackfill(books: readonly LocalBook[]) {
  useEffect(() => {
    const todo = books.filter((b) => !b.deletedAt && !b.coverUrl && !inFlight.has(b.id) && !wasChecked(b.id));
    if (!todo.length || !navigator.onLine) return;
    for (const b of todo) inFlight.add(b.id);
    void (async () => {
      for (const b of todo) {
        try {
          const cover = await findCover(b);
          markCoverChecked(b.id);
          const current = await getLocalDb().books.get(b.id);
          if (cover && current && !current.coverUrl && !current.deletedAt) await updateBook(b.id, { coverUrl: cover });
        } catch {
          // Retried the next time the books change or the app opens.
        } finally {
          inFlight.delete(b.id);
        }
      }
    })();
  }, [books]);
}
