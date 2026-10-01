"use client";
import { useSyncState } from "@/local/hooks";
import { cn } from "../ui/cn";

/** Compact status dot + label for the header. Never blocks anything. */
export function SyncIndicator() {
  const s = useSyncState();
  let label = "Synced";
  let dot = "bg-success";
  if (!s.online) {
    label = s.pendingCount ? `Offline · ${s.pendingCount} saved` : "Offline";
    dot = "bg-muted";
  } else if (s.failedCount) {
    label = "Needs attention";
    dot = "bg-danger";
  } else if (s.syncing || s.pendingCount) {
    label = "Syncing…";
    dot = "bg-warn animate-pulse";
  } else if (s.lastError) {
    label = "Will retry";
    dot = "bg-warn";
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-paper-2 px-2.5 py-1 text-xs font-semibold text-ink-2" role="status" aria-live="polite">
      <span className={cn("size-2 rounded-full", dot)} aria-hidden />
      {label}
    </span>
  );
}
