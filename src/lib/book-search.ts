/**
 * Book lookup via Open Library (free, no API key, CORS-enabled), called straight from the browser.
 * Covers are only ever stored as Open Library cover URLs so every reader's device loads them from the
 * same trusted host — see `coverUrl` in validation/fields.
 */

export const COVER_HOST = "covers.openlibrary.org";

export interface BookSearchResult {
  key: string;
  title: string;
  author: string | null;
  totalPages: number | null;
  coverUrl: string | null;
}

export function coverUrlFor(coverId: number, size: "S" | "M" | "L" = "M") {
  return `https://${COVER_HOST}/b/id/${coverId}-${size}.jpg`;
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

export async function searchBooks(query: string, signal?: AbortSignal): Promise<BookSearchResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "key,title,author_name,cover_i,number_of_pages_median");
  url.searchParams.set("limit", "6");
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  return parseOpenLibrarySearch(await res.json());
}
