"use client";
import { useSyncState } from "@/local/hooks";
import { cn } from "../ui/cn";

/** A quiet dot + word. Never blocks anything. */
export function SyncIndicator({ dark = false }: { dark?: boolean }) {
  const s = useSyncState();
  let label = "Synced";
  let dot = "bg-good";
  if (!s.online) {
    label = s.pendingCount ? `Offline · ${s.pendingCount} saved` : "Offline";
    dot = "bg-muted";
  } else if (s.failedCount) {
    label = "Needs attention";
    dot = "bg-signal";
  } else if (s.syncing || s.pendingCount) {
    label = "Syncing";
    dot = "bg-honey animate-pulse";
  } else if (s.lastError) {
    label = "Will retry";
    dot = "bg-honey";
  }
  return (
    <span
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-xs font-medium", dark ? "bg-white/10 text-white/80" : "bg-white/55 text-ink/70 backdrop-blur-md")}
      role="status"
      aria-live="polite"
    >
      <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
      {label}
    </span>
  );
}
