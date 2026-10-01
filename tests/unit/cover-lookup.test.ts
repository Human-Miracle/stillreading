import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedCover, lookUpCover } from "@/components/books/cover-lookup";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

function stubSearch(coverId: number | null) {
  const fetch = vi.fn(async () => Response.json({ results: coverId ? [{ key: "k", title: "T", author: null, totalPages: null, coverUrl: `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` }] : [] }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("lookUpCover", () => {
  it("looks each title up once and caches the answer", async () => {
    const fetch = stubSearch(42);
    const book = { title: "Atomic Habits", author: "James Clear" };
    const [a, b] = await Promise.all([lookUpCover(book), lookUpCover({ title: " atomic  habits", author: "james clear" })]);
    expect(a).toBe("https://covers.openlibrary.org/b/id/42-M.jpg");
    expect(b).toBe(a);
    expect(await lookUpCover(book)).toBe(a);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cachedCover(book)).toBe(a);
  });

  it("remembers misses so they aren't searched on every render", async () => {
    const fetch = stubSearch(null);
    const book = { title: "My Handwritten Journal", author: null };
    expect(await lookUpCover(book)).toBeNull();
    expect(cachedCover(book)).toBeNull();
    await lookUpCover(book);
    expect(fetch).toHaveBeenCalledTimes(1); // title-only search, then cached
  });

  it("ignores stored URLs that aren't Open Library covers", () => {
    store.set("sr-cover-lookup:evil|", JSON.stringify({ url: "https://evil.example/x.jpg", at: Date.now() }));
    expect(cachedCover({ title: "evil" })).toBeUndefined();
  });
});
