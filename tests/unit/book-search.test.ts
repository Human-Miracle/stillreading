import { describe, expect, it, vi } from "vitest";
import { cleanBookQuery, coverSrc, coverUrlFor, findCovers, openLibrarySearchUrl, parseOpenLibrarySearch } from "@/lib/book-search";
import { authorsMatch, mainTitle, sameBook, titlesMatch } from "@/lib/book-match";
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

describe("coverSrc", () => {
  it("serves Open Library covers through our own route", () => {
    expect(coverSrc(coverUrlFor(8259443))).toBe("/covers/8259443-M.jpg");
    expect(coverSrc(coverUrlFor(8259443), "S")).toBe("/covers/8259443-S.jpg");
  });

  it("leaves anything else untouched", () => {
    expect(coverSrc("https://covers.openlibrary.org/b/isbn/123-M.jpg")).toBe("https://covers.openlibrary.org/b/isbn/123-M.jpg");
  });
});

describe("mainTitle", () => {
  it("drops subtitles and series notes, keeping hyphenated titles", () => {
    expect(mainTitle("Atomic Habits: An Easy & Proven Way to Build Good Habits")).toBe("Atomic Habits");
    expect(mainTitle("Dune (Dune Chronicles #1)")).toBe("Dune");
    expect(mainTitle("Rich Dad Poor Dad - What the Rich Teach Their Kids")).toBe("Rich Dad Poor Dad");
    expect(mainTitle("Spider-Man")).toBe("Spider-Man");
    expect(mainTitle("The 48 Laws of Power")).toBe("The 48 Laws of Power");
  });
});

describe("sameBook", () => {
  it("matches titles despite case, punctuation, articles, subtitles and a small typo", () => {
    expect(titlesMatch("atomic habits", "Atomic Habits: An Easy & Proven Way to Build Good Habits")).toBe(true);
    expect(titlesMatch("The Psychology of Money", "Psychology of money")).toBe(true);
    expect(titlesMatch("Thinking Fast and Slow", "Thinking, Fast & Slow")).toBe(true);
    expect(titlesMatch("The Alchemistt", "The Alchemist")).toBe(true);
    expect(titlesMatch("Thank you for remembering", "The Writer's Resource")).toBe(false);
    expect(titlesMatch("Thank you for remembering", "Thank You for Remembering Me")).toBe(false);
    expect(titlesMatch("Dune", "Dune Messiah")).toBe(false);
  });

  it("matches the author by surname, against any of the book's authors", () => {
    expect(authorsMatch("James Clear", ["James Clear"])).toBe(true);
    expect(authorsMatch("J. Clear", ["James Clear"])).toBe(true);
    expect(authorsMatch("Chimamanda Adichie", ["Chimamanda Ngozi Adichie"])).toBe(true);
    expect(authorsMatch("Daniel Kahneman", ["Someone", "Daniel Kahnemann"])).toBe(true);
    expect(authorsMatch("Emily Harding", ["Someone Else"])).toBe(false);
    expect(authorsMatch("Emily Harding", [])).toBe(false);
  });

  it("needs both when the reader gave an author, and just the title otherwise", () => {
    const found = { title: "Thank You for Remembering", authors: ["Someone Else"] };
    expect(sameBook({ title: "Thank you for remembering", author: "Emily Harding" }, found)).toBe(false);
    expect(sameBook({ title: "Thank you for remembering", author: null }, found)).toBe(true);
    expect(sameBook({ title: "Thank you for remembering", author: "Emily Harding" }, { ...found, authors: ["Emily Harding"] })).toBe(true);
  });
});
