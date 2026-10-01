import { describe, expect, it, vi } from "vitest";
import { cleanBookQuery, coverUrlFor, findCovers, openLibrarySearchUrl, parseOpenLibrarySearch } from "@/lib/book-search";
import { coverUrl } from "@/lib/validation/fields";

describe("parseOpenLibrarySearch", () => {
  it("maps title, first author, page count and cover", () => {
    const json = {
      docs: [
        { key: "/works/OL17930368W", title: "Atomic Habits", author_name: ["James Clear"], cover_i: 12539702, number_of_pages_median: 306.4 },
        { key: "/works/OL1W", title: "No Cover" },
        { key: "/works/OL2W", title: "  " },
        { title: "No key" },
      ],
    };
    expect(parseOpenLibrarySearch(json)).toEqual([
      { key: "/works/OL17930368W", title: "Atomic Habits", author: "James Clear", totalPages: 306, coverUrl: "https://covers.openlibrary.org/b/id/12539702-M.jpg" },
      { key: "/works/OL1W", title: "No Cover", author: null, totalPages: null, coverUrl: null },
    ]);
  });

  it("tolerates unexpected shapes", () => {
    expect(parseOpenLibrarySearch(null)).toEqual([]);
    expect(parseOpenLibrarySearch({ docs: "nope" })).toEqual([]);
    expect(parseOpenLibrarySearch({ docs: [{ key: "/works/x", title: "T", cover_i: "12", author_name: [3] }] })).toEqual([
      { key: "/works/x", title: "T", author: null, totalPages: null, coverUrl: null },
    ]);
  });
});

describe("coverUrl validation", () => {
  it("accepts Open Library cover URLs only", () => {
    expect(coverUrl.safeParse(coverUrlFor(42)).success).toBe(true);
    for (const bad of [
      "http://covers.openlibrary.org/b/id/42-M.jpg",
      "https://evil.example.com/b/id/42-M.jpg",
      "https://covers.openlibrary.org.evil.com/x.jpg",
      "https://user@covers.openlibrary.org/x.jpg",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(coverUrl.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("book queries", () => {
  it("drops empty or too-short parts", () => {
    expect(cleanBookQuery({ q: "  ab " })).toBeNull();
    expect(cleanBookQuery({ title: " Scythe ", author: "  " })).toEqual({ title: "Scythe" });
    expect(cleanBookQuery({ title: "Scythe", author: "Neal Shusterman" })).toEqual({ title: "Scythe", author: "Neal Shusterman" });
  });

  it("builds an Open Library search URL with only the fields we use", () => {
    const url = openLibrarySearchUrl({ title: "Scythe", author: "Neal Shusterman" });
    expect(url.searchParams.get("title")).toBe("Scythe");
    expect(url.searchParams.get("author")).toBe("Neal Shusterman");
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.get("fields")).toBe("key,title,author_name,cover_i,number_of_pages_median");
  });
});

describe("findCovers", () => {
  const result = (id: number | null, title = "Scythe") => ({ key: `/works/${id}`, title, author: null, totalPages: null, coverUrl: id ? coverUrlFor(id) : null });

  it("falls back to the title alone when title + author finds no cover", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      const params = new URL(url, "http://x").searchParams;
      seen.push(params.toString());
      return Response.json({ results: params.has("author") ? [result(null)] : [result(7), result(7), result(8)] });
    });
    try {
      expect(await findCovers({ title: "Scythe", author: "Neil Shusterman" })).toEqual([coverUrlFor(7), coverUrlFor(8)]);
      expect(seen).toEqual(["title=Scythe&author=Neil+Shusterman", "title=Scythe"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
