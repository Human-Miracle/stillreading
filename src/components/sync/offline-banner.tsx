"use client";
import { discardFailed, retryFailed } from "@/local/repo";
import { useFailedOps, useSyncState } from "@/local/hooks";
import { Button } from "../ui/button";
import { Notice } from "../ui/misc";

export function OfflineBanner() {
  const s = useSyncState();
  if (s.online) return null;
  return (
    <Notice tone="info" className="animate-rise">
      <p className="font-semibold">You&apos;re offline.</p>
      <p>Your reading is still safe on this device. We&apos;ll sync when you&apos;re back.</p>
    </Notice>
  );
}

const LABELS: Record<string, string> = {
  "session.create": "A check-in",
  "session.delete": "Removing a check-in",
  "book.upsert": "A book update",
  "book.delete": "Removing a book",
  "goal.upsert": "Your goal change",
  "participant.update": "Your name change",
  "reaction.set": "A reaction",
};

export function SyncFailures() {
  const failed = useFailedOps();
  const s = useSyncState();
  if (!failed.length) {
    if (s.online && s.lastError && s.pendingCount) {
      return (
        <Notice tone="warn">
          <p className="font-semibold">Couldn&apos;t sync yet.</p>
          <p>Your reading is saved locally. We&apos;ll keep trying.</p>
        </Notice>
      );
    }
    return null;
  }
  return (
    <Notice tone="warn" className="space-y-3">
      {failed.map((op) => (
        <div key={op.opId}>
          <p>
            <span className="font-semibold">{LABELS[op.type] ?? "A change"} couldn&apos;t be saved to your challenge.</span>{" "}
            {op.lastError}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void retryFailed()}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void discardFailed(op.opId)}>
              Discard
            </Button>
          </div>
        </div>
      ))}
    </Notice>
  );
}
