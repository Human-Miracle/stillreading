import { getDb } from "@/db/client";
import { cleanBookQuery } from "@/lib/book-search";
import { clientIp, json, route } from "@/server/http";
import { searchOpenLibrary } from "@/server/open-library";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Open Library book search, proxied so browsers get a same-origin, cacheable, rate-limited lookup. */
export const GET = route("GET /api/books/search", async (req) => {
  const params = new URL(req.url).searchParams;
  const query = cleanBookQuery({ q: params.get("q") ?? undefined, title: params.get("title") ?? undefined, author: params.get("author") });
  if (!query) return json({ results: [] });

  await rateLimit(await getDb(), LIMITS.bookSearch, clientIp(req));
  const results = await searchOpenLibrary(query);
  return json({ results }, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
});
