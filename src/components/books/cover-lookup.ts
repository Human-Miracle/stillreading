"use client";
import { useEffect, useState } from "react";
import { COVER_HOST, findCover } from "@/lib/book-search";

/**
 * Display-only cover lookups for books we can't save a cover onto — other readers' books whose
 * owner hasn't backfilled one yet (older app version, or they haven't opened the app since). The
 * result lives only on this device: found covers and misses are cached in localStorage so each
 * title is searched once, and lookups run one at a time to stay well inside the search rate limit.
 */

const PREFIX = "sr-cover-lookup:";
const MISS_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

type Entry = { url: string | null; at: number };

const memory = new Map<string, Entry>();
const pending = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
export const coverLookupKey = (book: { title: string; author?: string | null }) => `${norm(book.title)}|${norm(book.author)}`;

function read(key: string): Entry | null {
  const hit = memory.get(key);
  if (hit) return hit;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry;
    // Only ever trust Open Library cover URLs, whatever ended up in storage.
    if (entry.url !== null && (typeof entry.url !== "string" || new URL(entry.url).host !== COVER_HOST)) return null;
    memory.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

function write(key: string, url: string | null) {
  const entry = { url, at: Date.now() };
  memory.set(key, entry);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage unavailable: the in-memory cache still covers this session.
  }
}

/** A cached answer: the cover URL, null for a known miss, undefined when we haven't looked yet. */
export function cachedCover(book: { title: string; author?: string | null }): string | null | undefined {
  const entry = read(coverLookupKey(book));
  if (!entry) return undefined;
  if (entry.url === null && Date.now() - entry.at > MISS_RETRY_MS) return undefined;
  return entry.url;
}

/** Looks the cover up (once per title per device), queued behind any other lookups. */
export function lookUpCover(book: { title: string; author?: string | null }): Promise<string | null> {
  const known = cachedCover(book);
  if (known !== undefined) return Promise.resolve(known);
  const key = coverLookupKey(book);
  const existing = pending.get(key);
  if (existing) return existing;
  const run = queue
    .catch(() => undefined)
    .then(async () => {
      const url = await findCover({ title: book.title, author: book.author ?? null });
      write(key, url);
      return url;
    })
    .finally(() => pending.delete(key));
  queue = run;
  pending.set(key, run);
  return run;
}

/** The looked-up cover for a book that has none of its own, or null while unknown / not found. */
export function useLookedUpCover(book: { title: string; author?: string | null }, enabled: boolean): string | null {
  const [found, setFound] = useState<{ key: string; url: string | null } | null>(null);
  const key = coverLookupKey(book);
  const cached = enabled ? cachedCover(book) : undefined;
  useEffect(() => {
    if (!enabled || cached !== undefined || !navigator.onLine || book.title.trim().length < 2) return;
    let live = true;
    lookUpCover(book).then(
      (url) => live && setFound({ key, url }),
      () => undefined, // Offline or upstream down: try again next time this cover renders.
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures title + author
  }, [enabled, key, cached]);
  if (!enabled) return null;
  if (cached !== undefined) return cached;
  return found?.key === key ? found.url : null;
}
