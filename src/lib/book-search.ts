/**
 * Book lookup backed by Open Library (free, no API key). The browser calls our own
 * `/api/books/search`, which queries Open Library server-side, so lookups don't depend on Open
 * Library's CORS headers or the service worker. Covers are only ever stored as Open Library cover
 * URLs so every reader's device loads them from the same trusted host — see `coverUrl` in
 * validation/fields.
 */

export const COVER_HOST = "covers.openlibrary.org";

export interface BookSearchResult {
  key: string;
  title: string;
  author: string | null;
  totalPages: number | null;
  coverUrl: string | null;
}

export interface BookQuery {
  /** Free text, as typed into the title field. */
  q?: string;
  title?: string;
  author?: string | null;
}

export function coverUrlFor(coverId: number, size: "S" | "M" | "L" = "M") {
  return `https://${COVER_HOST}/b/id/${coverId}-${size}.jpg`;
}

/** Normalises a query; null when there is nothing worth searching for. */
export function cleanBookQuery(input: BookQuery): BookQuery | null {
  const q = input.q?.trim().slice(0, 200) ?? "";
  const title = input.title?.trim().slice(0, 200) ?? "";
  const author = input.author?.trim().slice(0, 120) ?? "";
  if (q.length < 3 && title.length < 2) return null;
  return { ...(q.length >= 3 ? { q } : {}), ...(title.length >= 2 ? { title } : {}), ...(author ? { author } : {}) };
}

export function openLibrarySearchUrl(query: BookQuery, limit = 6): URL {
  const url = new URL("https://openlibrary.org/search.json");
  if (query.q) url.searchParams.set("q", query.q);
  if (query.title) url.searchParams.set("title", query.title);
  if (query.author) url.searchParams.set("author", query.author);
  url.searchParams.set("fields", "key,title,author_name,cover_i,number_of_pages_median");
  url.searchParams.set("limit", String(limit));
  return url;
}

interface OpenLibraryDoc {
  key?: unknown;
  title?: unknown;
  author_name?: unknown;
  cover_i?: unknown;
  number_of_pages_median?: unknown;
}

/** Defensive parse of an Open Library `search.json` response. */
export function parseOpenLibrarySearch(json: unknown): BookSearchResult[] {
  const docs = (json as { docs?: unknown } | null)?.docs;
  if (!Array.isArray(docs)) return [];
  const out: BookSearchResult[] = [];
  for (const d of docs as OpenLibraryDoc[]) {
    if (typeof d?.key !== "string" || typeof d.title !== "string" || !d.title.trim()) continue;
    const author = Array.isArray(d.author_name) && typeof d.author_name[0] === "string" ? d.author_name[0] : null;
    const pages = typeof d.number_of_pages_median === "number" && d.number_of_pages_median > 0 ? Math.min(Math.round(d.number_of_pages_median), 20000) : null;
    const coverId = typeof d.cover_i === "number" && Number.isInteger(d.cover_i) && d.cover_i > 0 ? d.cover_i : null;
    out.push({
      key: d.key,
      title: d.title.trim().slice(0, 200),
      author: author ? author.trim().slice(0, 120) : null,
      totalPages: pages,
      coverUrl: coverId ? coverUrlFor(coverId) : null,
    });
  }
  return out;
}

/** Throws when the lookup itself failed (offline, upstream down), so callers can retry later. */
export async function searchBooks(query: BookQuery, signal?: AbortSignal): Promise<BookSearchResult[]> {
  const clean = cleanBookQuery(query);
  if (!clean) return [];
  const params = new URLSearchParams(clean as Record<string, string>);
  const res = await fetch(`/api/books/search?${params}`, { signal });
  if (!res.ok) throw new Error(`Book search failed (${res.status})`);
  const body = (await res.json()) as { results?: BookSearchResult[] };
  return body.results ?? [];
}

/**
 * Covers for a book we already know the title (and maybe author) of, best match first. Falls back to
 * the title alone when title + author finds nothing, so a misspelt author still gets a cover.
 */
export async function findCovers(book: { title: string; author?: string | null }, signal?: AbortSignal): Promise<string[]> {
  const covers = (results: BookSearchResult[]) => [...new Set(results.flatMap((r) => (r.coverUrl ? [r.coverUrl] : [])))];
  const byBoth = book.author?.trim() ? covers(await searchBooks({ title: book.title, author: book.author }, signal)) : [];
  return byBoth.length ? byBoth : covers(await searchBooks({ title: book.title }, signal));
}

export async function findCover(book: { title: string; author: string | null }, signal?: AbortSignal): Promise<string | null> {
  return (await findCovers(book, signal))[0] ?? null;
}
