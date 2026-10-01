import { cleanBookQuery, openLibrarySearchUrl, parseOpenLibrarySearch, type BookQuery, type BookSearchResult } from "@/lib/book-search";
import { ApiError } from "./http";
import { log } from "./log";

const USER_AGENT = "StillReading/0.1 (+https://github.com/pwadeveloper/stillreading)";

/** Server-side Open Library search. Throws a 502 ApiError when Open Library can't be reached. */
export async function searchOpenLibrary(query: BookQuery, limit = 6): Promise<BookSearchResult[]> {
  const clean = cleanBookQuery(query);
  if (!clean) return [];
  let res: Response;
  try {
    res = await fetch(openLibrarySearchUrl(clean, limit), { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  } catch (err) {
    log.warn("book_search_failed", { reason: err instanceof Error ? err.name : "unknown" });
    throw new ApiError(502, "upstream_unavailable", "Book search is unavailable right now.");
  }
  if (!res.ok) {
    log.warn("book_search_failed", { status: res.status });
    throw new ApiError(502, "upstream_unavailable", "Book search is unavailable right now.");
  }
  return parseOpenLibrarySearch(await res.json());
}

/** Best Open Library cover for a known title (+ author), falling back to the title alone. */
export async function findCoverOnServer(book: { title: string; author: string | null }): Promise<string | null> {
  const first = (results: BookSearchResult[]) => results.find((r) => r.coverUrl)?.coverUrl ?? null;
  if (book.author?.trim()) {
    const both = first(await searchOpenLibrary({ title: book.title, author: book.author }, 3));
    if (both) return both;
  }
  return first(await searchOpenLibrary({ title: book.title }, 3));
}
