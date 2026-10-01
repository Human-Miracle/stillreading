import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { api, freshDb } from "../helpers/server";
import type { BookSearchResult } from "@/lib/book-search";

const realFetch = globalThis.fetch;

function stubOpenLibrary(respond: (url: URL) => Response | Promise<Response>) {
  const calls: URL[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push(url);
    return respond(url);
  }) as typeof fetch;
  return calls;
}

beforeAll(async () => {
  await freshDb();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("GET /api/books/search", () => {
  it("queries Open Library by title and author and returns parsed results", async () => {
    const calls = stubOpenLibrary(() =>
      Response.json({ docs: [{ key: "/works/OL1W", title: "Scythe", author_name: ["Neal Shusterman"], cover_i: 8259443, number_of_pages_median: 435 }] }),
    );
    const res = await api<{ results: BookSearchResult[] }>("GET", "/api/books/search?title=Scythe&author=Neil%20Shusterman");
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      { key: "/works/OL1W", title: "Scythe", author: "Neal Shusterman", totalPages: 435, coverUrl: "https://covers.openlibrary.org/b/id/8259443-M.jpg" },
    ]);
    expect(calls[0]!.origin + calls[0]!.pathname).toBe("https://openlibrary.org/search.json");
    expect(calls[0]!.searchParams.get("title")).toBe("Scythe");
    expect(calls[0]!.searchParams.get("author")).toBe("Neil Shusterman");
  });

  it("skips the upstream call for queries that are too short", async () => {
    const calls = stubOpenLibrary(() => Response.json({ docs: [] }));
    const res = await api<{ results: BookSearchResult[] }>("GET", "/api/books/search?q=ab");
    expect(res).toMatchObject({ status: 200, body: { results: [] } });
    expect(calls).toHaveLength(0);
  });

  it("reports an upstream failure as 502 so clients retry later", async () => {
    stubOpenLibrary(() => new Response("busy", { status: 503 }));
    expect((await api("GET", "/api/books/search?q=Scythe")).status).toBe(502);
    stubOpenLibrary(() => Promise.reject(new TypeError("fetch failed")));
    expect((await api("GET", "/api/books/search?q=Scythe")).status).toBe(502);
  });
});
