"use client";
import { useEffect } from "react";
import type { LocalBook } from "@/local/db";
import { apiRequest } from "@/local/api";
import { getSyncEngine } from "@/local/sync/engine";

const MIN_GAP_MS = 10 * 60 * 1000;
const MAX_ROUNDS = 20;
const key = (challengeId: string) => `sr-cover-fill:${challengeId}`;
const running = new Set<string>();

interface FillResult {
  filled: number;
  checked: number;
  remaining: number;
  failed: string[];
}

function lastRun(challengeId: string): { at: number; missing: number } | null {
  try {
    return JSON.parse(localStorage.getItem(key(challengeId)) ?? "null") as { at: number; missing: number } | null;
  } catch {
    return null;
  }
}

function remember(challengeId: string, missing: number) {
  try {
    localStorage.setItem(key(challengeId), JSON.stringify({ at: Date.now(), missing }));
  } catch {
    // ignore
  }
}

/** Works through the challenge's coverless books a few at a time, pulling found covers as they land. */
async function fillCovers(challengeId: string) {
  const skip: string[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await apiRequest<FillResult>(`/api/challenges/${challengeId}/covers`, { method: "POST", body: { skip }, signal: AbortSignal.timeout(70_000) });
    if (res.filled) void getSyncEngine().sync();
    skip.push(...res.failed);
    if (!res.remaining || (!res.checked && !res.failed.length)) return true;
  }
  return true;
}

/**
 * Asks the server to find Open Library covers for any book in the challenge that has none — anyone's,
 * not just this reader's — and pulls the result so the covers show up for everyone. Runs when books
 * without covers appear, and otherwise at most every ten minutes per device.
 */
export function useCoverFill(challengeId: string, books: readonly LocalBook[] | undefined) {
  const missing = books?.filter((b) => !b.coverUrl && !b.deletedAt).length ?? 0;
  useEffect(() => {
    if (!missing || !navigator.onLine || running.has(challengeId)) return;
    const last = lastRun(challengeId);
    if (last && missing <= last.missing && Date.now() - last.at < MIN_GAP_MS) return;
    running.add(challengeId);
    fillCovers(challengeId)
      .then(
        () => remember(challengeId, missing),
        () => undefined, // Offline, rate limited or Open Library down: try again next time.
      )
      .finally(() => running.delete(challengeId));
  }, [challengeId, missing]);
}
