import { describe, expect, it } from "vitest";
import { coverUrlFor, parseOpenLibrarySearch } from "@/lib/book-search";
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
