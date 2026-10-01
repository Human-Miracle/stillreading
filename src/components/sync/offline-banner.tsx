"use client";
import { discardFailed, retryFailed } from "@/local/repo";
import { useFailedOps, useSyncState } from "@/local/hooks";
import { Button } from "../ui/button";

const LABELS: Record<string, string> = {
  "session.create": "A check-in",
  "session.delete": "Removing a check-in",
  "book.upsert": "A book update",
  "book.delete": "Removing a book",
  "goal.upsert": "Your goal change",
  "participant.update": "Your name change",
  "reaction.set": "A reaction",
};

/** Floating status toasts that sit just above the bottom navigation. */
export function SyncToasts() {
  const s = useSyncState();
  const failed = useFailedOps();
  const showRetrying = s.online && !failed.length && s.lastError && s.pendingCount > 0;
  if (s.online && !failed.length && !showRetrying) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-[440px] flex-col gap-2 px-4">
      {!s.online ? (
        <div className="pointer-events-auto animate-rise rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-float" role="status">
          <p className="font-medium">You&apos;re offline.</p>
          <p className="text-white/65">Your reading is still safe on this device. We&apos;ll sync when you&apos;re back.</p>
        </div>
      ) : null}
      {showRetrying ? (
        <div className="pointer-events-auto animate-rise rounded-2xl bg-butter px-4 py-3 text-sm text-ink shadow-float" role="status">
          <p className="font-medium">Couldn&apos;t sync yet.</p>
          <p className="text-ink/70">Your reading is saved locally. We&apos;ll keep trying.</p>
        </div>
      ) : null}
      {failed.map((op) => (
        <div key={op.opId} className="pointer-events-auto animate-rise rounded-2xl bg-surface px-4 py-3 text-sm shadow-float" role="alert">
          <p>
            <span className="font-medium">{LABELS[op.type] ?? "A change"} couldn&apos;t be saved.</span> <span className="text-muted">{op.lastError}</span>
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" onClick={() => void retryFailed()}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void discardFailed(op.opId)}>
              Discard
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
