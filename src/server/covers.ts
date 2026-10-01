import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { books } from "@/db/schema";
import { findCoverOnServer } from "./open-library";

/** A title that found nothing is looked up again after this long (Open Library keeps growing). */
export const MISSING_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH = 12;
const CONCURRENCY = 4;

/**
 * Finds Open Library covers for this challenge's books that have none — added by hand, or by a reader
 * on an older app version — and saves them onto the books, so every member sees them after their next
 * pull. Books whose reader removed the cover on purpose are left alone. Returns how many were filled.
 */
export async function fillMissingCovers(db: DbOrTx, challengeId: string, now = new Date()): Promise<number> {
  const todo = await db
    .select({ id: books.id, title: books.title, author: books.author })
    .from(books)
    .where(
      and(
        eq(books.challengeId, challengeId),
        isNull(books.coverUrl),
        isNull(books.deletedAt),
        or(isNull(books.coverLookup), and(eq(books.coverLookup, "missing"), lt(books.coverCheckedAt, new Date(now.getTime() - MISSING_RETRY_MS)))),
      ),
    )
    .orderBy(asc(books.createdAt))
    .limit(BATCH);

  let filled = 0;
  const queue = [...todo];
  const worker = async () => {
    for (let book = queue.shift(); book; book = queue.shift()) {
      let cover: string | null;
      try {
        cover = await findCoverOnServer(book);
      } catch {
        return; // Open Library unreachable: leave the rest unchecked for next time.
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
      if (cover && saved.length) filled++;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return filled;
}
