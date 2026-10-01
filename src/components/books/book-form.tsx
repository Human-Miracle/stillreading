"use client";
import { useEffect, useState } from "react";
import { searchBooks, type BookSearchResult } from "@/lib/book-search";
import type { LocalBook } from "@/local/db";
import { Field, Input } from "../ui/field";

export interface BookDraft {
  title: string;
  author: string;
  totalPages: string;
  coverUrl: string | null;
}

export const emptyBook: BookDraft = { title: "", author: "", totalPages: "", coverUrl: null };

export function bookToDraft(book: Pick<LocalBook, "title" | "author" | "totalPages" | "coverUrl">): BookDraft {
  return { title: book.title, author: book.author ?? "", totalPages: book.totalPages ? String(book.totalPages) : "", coverUrl: book.coverUrl };
}

export function bookDraftToInput(d: BookDraft) {
  const pages = Number.parseInt(d.totalPages, 10);
  return {
    title: d.title.trim(),
    author: d.author.trim() || null,
    totalPages: Number.isFinite(pages) && pages > 0 ? Math.min(pages, 20000) : null,
    coverUrl: d.coverUrl,
  };
}

/** Open Library matches for the title being typed, debounced. Quietly empty when offline. */
function useBookSearch(query: string, enabled: boolean) {
  const q = query.trim();
  const active = enabled && q.length >= 3;
  const [found, setFound] = useState<{ q: string; results: BookSearchResult[] } | null>(null);
  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      searchBooks(q, ctrl.signal)
        .catch(() => [])
        .then((results) => {
          if (!ctrl.signal.aborted) setFound({ q, results });
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, active]);
  const fresh = active && found?.q === q;
  return { results: fresh ? found.results : [], loading: active && !fresh };
}

export function BookForm({ value, onChange, autoFocus }: { value: BookDraft; onChange: (v: BookDraft) => void; autoFocus?: boolean }) {
  // Only search after the reader types, not for a title that was prefilled or picked from the list.
  const [searching, setSearching] = useState(false);
  const { results, loading } = useBookSearch(value.title, searching);

  const pick = (r: BookSearchResult) => {
    setSearching(false);
    onChange({
      title: r.title,
      author: r.author ?? value.author,
      totalPages: r.totalPages ? String(r.totalPages) : value.totalPages,
      coverUrl: r.coverUrl ?? value.coverUrl,
    });
  };

  return (
    <div className="space-y-4">
      <Field label="Title" hint={searching && value.title.trim().length >= 3 ? (loading ? "Searching…" : results.length ? "Pick a match to fill in the details and cover." : null) : null}>
        {(p) => (
          <Input
            {...p}
            autoFocus={autoFocus}
            autoComplete="off"
            maxLength={200}
            placeholder="Atomic Habits"
            value={value.title}
            onChange={(e) => {
              setSearching(true);
              onChange({ ...value, title: e.target.value });
            }}
          />
        )}
      </Field>
      {searching && results.length ? (
        <ul aria-label="Matching books" className="-mt-1 overflow-hidden rounded-2xl bg-surface shadow-soft">
          {results.map((r) => (
            <li key={r.key} className="dotted last:bg-none">
              <button type="button" onClick={() => pick(r)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
                {r.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote cover, no image optimisation needed
                  <img src={r.coverUrl.replace("-M.jpg", "-S.jpg")} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded-sm bg-surface-2 object-cover" />
                ) : (
                  <span className="h-12 w-8 shrink-0 rounded-sm bg-surface-2" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{r.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {[r.author, r.totalPages ? `${r.totalPages} pages` : null].filter(Boolean).join(" · ") || "Unknown author"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {value.coverUrl ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote cover, no image optimisation needed */}
          <img src={value.coverUrl} alt="Selected cover" className="h-20 w-14 rounded-md object-cover shadow-soft" />
          <button type="button" className="text-sm font-medium text-muted underline underline-offset-4" onClick={() => onChange({ ...value, coverUrl: null })}>
            Remove cover
          </button>
        </div>
      ) : null}
      <Field label="Author (optional)">
        {(p) => <Input {...p} maxLength={120} placeholder="James Clear" value={value.author} onChange={(e) => onChange({ ...value, author: e.target.value })} />}
      </Field>
      <Field label="Total pages (optional)" hint="Helps track how far through the book you are.">
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="320"
            value={value.totalPages}
            onChange={(e) => onChange({ ...value, totalPages: e.target.value.replace(/\D/g, "").slice(0, 5) })}
          />
        )}
      </Field>
    </div>
  );
}
