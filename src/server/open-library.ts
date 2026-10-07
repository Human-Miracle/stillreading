import { mainTitle, sameBook } from "@/lib/book-match";
import { cleanBookQuery, coverUrlFor, openLibrarySearchUrl, parseOpenLibrarySearch, type BookQuery, type BookSearchResult } from "@/lib/book-search";
import { ApiError } from "./http";
import { log } from "./log";

const USER_AGENT = "StillReading/0.1 (+https://github.com/pwadeveloper/stillreading)";

async function fetchOpenLibrary(query: BookQuery, limit: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(openLibrarySearchUrl(query, limit), { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  } catch (err) {
    log.warn("book_search_failed", { reason: err instanceof Error ? err.name : "unknown" });
    throw new ApiError(502, "upstream_unavailable", "Book search is unavailable right now.");
  }
  if (!res.ok) {
    log.warn("book_search_failed", { status: res.status });
    throw new ApiError(502, "upstream_unavailable", "Book search is unavailable right now.");
  }
  return res.json();
}

/** Server-side Open Library search. Throws a 502 ApiError when Open Library can't be reached. */
export async function searchOpenLibrary(query: BookQuery, limit = 6): Promise<BookSearchResult[]> {
  const clean = cleanBookQuery(query);
  if (!clean) return [];
  return parseOpenLibrarySearch(await fetchOpenLibrary(clean, limit));
}

/** Results with a cover, with every author listed (the app's search results keep only the first). */
async function coverCandidates(query: BookQuery): Promise<{ title: string; authors: string[]; coverUrl: string }[]> {
  const clean = cleanBookQuery(query);
  if (!clean) return [];
  const docs = (await fetchOpenLibrary(clean, 10)) as { docs?: { title?: unknown; author_name?: unknown; cover_i?: unknown }[] } | null;
  if (!Array.isArray(docs?.docs)) return [];
  return docs.docs.flatMap((d) => {
    const coverId = typeof d?.cover_i === "number" && Number.isInteger(d.cover_i) && d.cover_i > 0 ? d.cover_i : null;
    if (!coverId || typeof d.title !== "string") return [];
    const authors = Array.isArray(d.author_name) ? d.author_name.filter((a): a is string => typeof a === "string") : [];
    return [{ title: d.title, authors, coverUrl: coverUrlFor(coverId) }];
  });
}

/**
 * Open Library cover for a known title and author. Open Library's title search is strict and many of
 * its top matches have no cover, so this widens step by step: title + author, a keyword search, the
 * title without its subtitle, then the title alone. Every step only accepts a result that is the same
 * book (`sameBook`: matching title and author), because loose searches also return unrelated books.
 */
export async function findCoverOnServer(book: { title: string; author: string | null }): Promise<string | null> {
  const title = book.title.trim();
  const author = book.author?.trim() || null;
  const short = mainTitle(title);
  const queries: BookQuery[] = [];
  if (author) queries.push({ title, author }, { q: `${title} ${author}` });
  if (short.length >= 2 && short.toLowerCase() !== title.toLowerCase()) queries.push(author ? { title: short, author } : { title: short });
  queries.push({ title });

  for (const query of queries) {
    const match = (await coverCandidates(query)).find((r) => sameBook({ title, author }, r));
    if (match) return match.coverUrl;
  }
  return null;
}
