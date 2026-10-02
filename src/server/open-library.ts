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

/** Drops a subtitle or series note: "Atomic Habits: An Easy Way…" → "Atomic Habits", "Dune (Dune #1)" → "Dune". */
export function mainTitle(title: string): string {
  return title
    .replace(/\s*[([].*$/, "")
    .replace(/\s*[:;–—]\s.*$|\s+-\s.*$|:.*$/, "")
    .trim();
}

/**
 * Best Open Library cover for a known title and author. Open Library's title search is strict and many
 * of its top matches have no cover, so this widens step by step, stopping at the first cover found:
 * title + author, then a looser keyword search, then the title without its subtitle, then the title
 * alone (for a misspelt author).
 */
export async function findCoverOnServer(book: { title: string; author: string | null }): Promise<string | null> {
  const title = book.title.trim();
  const author = book.author?.trim() || null;
  const short = mainTitle(title);
  const queries: BookQuery[] = [];
  if (author) queries.push({ title, author }, { q: `${title} ${author}` });
  if (short.length >= 2 && short.toLowerCase() !== title.toLowerCase()) queries.push(author ? { title: short, author } : { title: short });
  queries.push({ title });
  if (!author) queries.push({ q: title });

  for (const query of queries) {
    const found = (await searchOpenLibrary(query, 10)).find((r) => r.coverUrl)?.coverUrl;
    if (found) return found;
  }
  return null;
}
