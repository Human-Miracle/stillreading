"use client";
import { useChallenge } from "@/components/challenge/context";
import { ReadingFeed } from "@/components/feed/reading-feed";
import { Button } from "@/components/ui/button";

export default function FeedPage() {
  const { view, openCheckIn } = useChallenge();
  const active = view.challenge.status !== "archived" && view.me?.progress.clock.phase === "active";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Feed</h1>
        {active ? (
          <Button size="sm" onClick={openCheckIn}>
            + Log reading
          </Button>
        ) : null}
      </div>
      <ReadingFeed view={view} />
    </div>
  );
}
