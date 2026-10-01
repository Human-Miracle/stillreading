import { getDb } from "@/db/client";
import { cleanBookQuery, openLibrarySearchUrl, parseOpenLibrarySearch } from "@/lib/book-search";
import { ApiError, clientIp, json, route } from "@/server/http";
import { log } from "@/server/log";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const USER_AGENT = "StillReading/0.1 (+https://github.com/pwadeveloper/stillreading)";

/** Open Library book search, proxied so browsers get a same-origin, cacheable, rate-limited lookup. */
export const GET = route("GET /api/books/search", async (req) => {
  const params = new URL(req.url).searchParams;
  const query = cleanBookQuery({ q: params.get("q") ?? undefined, title: params.get("title") ?? undefined, author: params.get("author") });
  if (!query) return json({ results: [] });

  await rateLimit(await getDb(), LIMITS.bookSearch, clientIp(req));

  let res: Response;
  try {
    res = await fetch(openLibrarySearchUrl(query), { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  } catch (err) {
    log.warn("book_search_failed", { reason: err instanceof Error ? err.name : "unknown" });
    throw new ApiError(502, "upstream_unavailable", "Book search is unavailable right now.");
  }
  if (!res.ok) {
    log.warn("book_search_failed", { status: res.status });
    throw new ApiError(502, "upstream_unavailable", "Book search is unavailable right now.");
  }
  const results = parseOpenLibrarySearch(await res.json());
  return json({ results }, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
});
