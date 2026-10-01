"use client";
import { useEffect } from "react";
import type { LocalBook } from "@/local/db";
import { apiRequest } from "@/local/api";
import { getSyncEngine } from "@/local/sync/engine";

const MIN_GAP_MS = 10 * 60 * 1000;
const key = (challengeId: string) => `sr-cover-fill:${challengeId}`;

function lastRun(challengeId: string): { at: number; missing: number } | null {
  try {
    return JSON.parse(localStorage.getItem(key(challengeId)) ?? "null") as { at: number; missing: number } | null;
  } catch {
    return null;
  }
}

/**
 * Asks the server to find Open Library covers for any book in the challenge that has none — anyone's,
 * not just this reader's — and pulls the result so the covers show up for everyone. Runs when books
 * without covers appear, and otherwise at most every ten minutes per device.
 */
export function useCoverFill(challengeId: string, books: readonly LocalBook[] | undefined) {
  const missing = books?.filter((b) => !b.coverUrl && !b.deletedAt).length ?? 0;
  useEffect(() => {
    if (!missing || !navigator.onLine) return;
    const last = lastRun(challengeId);
    if (last && missing <= last.missing && Date.now() - last.at < MIN_GAP_MS) return;
    try {
      localStorage.setItem(key(challengeId), JSON.stringify({ at: Date.now(), missing }));
    } catch {
      // ignore
    }
    void apiRequest<{ filled: number }>(`/api/challenges/${challengeId}/covers`, { method: "POST", signal: AbortSignal.timeout(90_000) }).then(
      ({ filled }) => (filled ? getSyncEngine().sync() : undefined),
      () => undefined, // Offline, rate limited or Open Library down: tried again later.
    );
  }, [challengeId, missing]);
}
