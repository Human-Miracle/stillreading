import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { books } from "@/db/schema";
import { findCoverOnServer } from "./open-library";

/** A title that found nothing is looked up again after this long (Open Library keeps growing). */
export const MISSING_RETRY_MS = 3 * 24 * 60 * 60 * 1000;
/** Small batches keep each request well inside the serverless time limit; the client asks again for the rest. */
const BATCH = 3;

export interface CoverFillResult {
  filled: number;
  checked: number;
  remaining: number;
  /** Lookups that failed this time (Open Library slow or down); the client skips them on its next call. */
  failed: string[];
}

/**
 * Finds Open Library covers for this challenge's books that have none — added by hand, or by a reader
 * on an older app version — and saves them onto the books, so every member sees them after their next
 * pull. Books whose reader removed the cover on purpose are left alone. A book whose lookup fails
 * (Open Library slow or down) stays unchecked and is tried again on a later call.
 */
export async function fillMissingCovers(db: DbOrTx, challengeId: string, opts: { now?: Date; skip?: readonly string[] } = {}): Promise<CoverFillResult> {
  const now = opts.now ?? new Date();
  const due = and(
    eq(books.challengeId, challengeId),
    isNull(books.coverUrl),
    isNull(books.deletedAt),
    or(isNull(books.coverLookup), and(eq(books.coverLookup, "missing"), lt(books.coverCheckedAt, new Date(now.getTime() - MISSING_RETRY_MS)))),
  );
  const candidates = await db.select({ id: books.id, title: books.title, author: books.author }).from(books).where(due).orderBy(asc(books.createdAt));
  const skip = new Set(opts.skip ?? []);
  const pending = candidates.filter((b) => !skip.has(b.id));
  const todo = pending.slice(0, BATCH);

  let filled = 0;
  let checked = 0;
  const failed: string[] = [];
  await Promise.all(
    todo.map(async (book) => {
      let cover: string | null;
      try {
        cover = await findCoverOnServer(book);
      } catch {
        failed.push(book.id);
        return;
      }
      const saved = await db
        .update(books)
        .set(
          cover
            ? { coverUrl: cover, coverLookup: "found", coverCheckedAt: now, serverUpdatedAt: sql`now()` }
            : { coverLookup: "missing", coverCheckedAt: now },
        )
        // Only if nothing changed meanwhile (the reader picked a cover, or edited the title).
        .where(and(eq(books.id, book.id), isNull(books.coverUrl), eq(books.title, book.title), isNull(books.deletedAt)))
        .returning({ id: books.id });
      checked++;
      if (cover && saved.length) filled++;
    }),
  );
  return { filled, checked, remaining: pending.length - todo.length, failed };
}
