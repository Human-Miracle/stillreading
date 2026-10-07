import { COVER_HOST } from "@/lib/book-search";
import { log } from "@/server/log";

const FILE_RE = /^(\d{1,12})-([SML])\.jpg$/;
const USER_AGENT = "StillReading/0.1 (+https://github.com/pwadeveloper/stillreading)";
const MAX_BYTES = 2_000_000;

/**
 * Open Library covers served from our own origin. Open Library answers cover URLs with a redirect to
 * archive.org, which some phones fail to load (and which a service worker can only see as an opaque
 * response). Fetching here follows the redirect server-side and returns a plain same-origin image
 * that the CDN, the browser and the service worker can all cache.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!FILE_RE.test(file)) return new Response("Not found", { status: 404 });

  // archive.org, where the images live, is sometimes slow or drops a request: give it a second go.
  let upstream: Response | null = null;
  for (let attempt = 0; attempt < 2 && !upstream; attempt++) {
    try {
      const res = await fetch(`https://${COVER_HOST}/b/id/${file}?default=false`, {
        headers: { "user-agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status < 500 || attempt === 1) upstream = res;
    } catch (err) {
      if (attempt === 1) log.warn("cover_fetch_failed", { reason: err instanceof Error ? err.name : "unknown" });
    }
  }
  if (!upstream) return new Response("Cover unavailable", { status: 502, headers: { "cache-control": "no-store" } });

  const type = upstream.headers.get("content-type") ?? "";
  if (upstream.status === 404) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=86400" } });
  if (!upstream.ok || !type.startsWith("image/")) {
    log.warn("cover_fetch_failed", { status: upstream.status });
    return new Response("Cover unavailable", { status: 502, headers: { "cache-control": "no-store" } });
  }
  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response("Cover too large", { status: 502, headers: { "cache-control": "no-store" } });

  return new Response(body, {
    headers: {
      "content-type": type,
      // A cover id always points at the same image.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
