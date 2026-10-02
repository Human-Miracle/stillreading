"use client";
import { useEffect, useState } from "react";
import { coverSrc, findCovers, searchBooks, type BookSearchResult } from "@/lib/book-search";
import type { LocalBook } from "@/local/db";
import { cn } from "../ui/cn";
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

/** A book needs its title and author: together they're how its cover is found. */
export function bookDraftReady(d: BookDraft): boolean {
  return Boolean(d.title.trim() && d.author.trim());
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
      searchBooks({ q }, ctrl.signal)
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

type CoverPicker = { status: "loading" } | { status: "done"; covers: string[] } | { status: "error" };

/** Covers for the title and author currently in the form, to pick from. */
function CoverChoices({ picker, current, onPick }: { picker: CoverPicker; current: string | null; onPick: (url: string) => void }) {
  if (picker.status === "loading") return <p className="text-sm text-muted">Looking for covers…</p>;
  if (picker.status === "error") return <p className="text-sm text-muted">Couldn&apos;t reach the book catalogue. Check your connection and try again.</p>;
  if (!picker.covers.length) return <p className="text-sm text-muted">No covers found. Check the title and author spelling.</p>;
  return (
    <ul aria-label="Covers" className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
      {picker.covers.map((url) => (
        <li key={url} className="shrink-0">
          <button
            type="button"
            aria-pressed={url === current}
            aria-label="Use this cover"
            onClick={() => onPick(url)}
            className={cn("block overflow-hidden rounded-md ring-offset-2 ring-offset-surface transition", url === current ? "ring-2 ring-ink" : "opacity-90 hover:opacity-100")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- remote cover, no image optimisation needed */}
            <img src={coverSrc(url)} alt="" loading="lazy" className="h-24 w-16 bg-surface-2 object-cover" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function BookForm({ value, onChange, autoFocus }: { value: BookDraft; onChange: (v: BookDraft) => void; autoFocus?: boolean }) {
  // Only search after the reader types, not for a title that was prefilled or picked from the list.
  const [searching, setSearching] = useState(false);
  const { results, loading } = useBookSearch(value.title, searching);
  const [picker, setPicker] = useState<CoverPicker | null>(null);

  const lookUpCovers = async () => {
    setPicker({ status: "loading" });
    try {
      setPicker({ status: "done", covers: await findCovers({ title: value.title, author: value.author }) });
    } catch {
      setPicker({ status: "error" });
    }
  };

  const pick = (r: BookSearchResult) => {
    setSearching(false);
    setPicker(null);
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
                  <img src={coverSrc(r.coverUrl, "S")} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded-sm bg-surface-2 object-cover" />
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
      <Field label="Author" hint="The title and author are how we find the book's cover.">
        {(p) => <Input {...p} autoComplete="off" maxLength={120} placeholder="James Clear" value={value.author} onChange={(e) => onChange({ ...value, author: e.target.value })} />}
      </Field>
      <div className="flex items-center gap-3">
        {value.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote cover, no image optimisation needed
          <img src={coverSrc(value.coverUrl)} alt="Selected cover" className="h-20 w-14 shrink-0 rounded-md bg-surface-2 object-cover shadow-soft" />
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-muted">
          <button type="button" className="underline underline-offset-4 disabled:opacity-50" disabled={value.title.trim().length < 2} onClick={() => void lookUpCovers()}>
            {value.coverUrl ? "Change cover" : "Find a cover"}
          </button>
          {value.coverUrl ? (
            <button type="button" className="underline underline-offset-4" onClick={() => onChange({ ...value, coverUrl: null })}>
              Remove cover
            </button>
          ) : null}
        </div>
      </div>
      {picker ? <CoverChoices picker={picker} current={value.coverUrl} onPick={(url) => onChange({ ...value, coverUrl: url })} /> : null}
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
