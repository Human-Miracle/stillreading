"use client";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChallengeContext } from "@/components/challenge/context";
import { ChallengeHeader } from "@/components/challenge/challenge-header";
import { BottomNav } from "@/components/challenge/nav";
import { CheckInComposer } from "@/components/check-in/check-in-composer";
import { OfflineBanner, SyncFailures } from "@/components/sync/offline-banner";
import { ButtonLink } from "@/components/ui/button";
import { PageSkeleton, Wordmark } from "@/components/ui/misc";
import { track } from "@/lib/analytics";
import { useChallengeView } from "@/local/hooks";
import { getSyncEngine } from "@/local/sync/engine";

function FullPageMessage({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <Wordmark className="text-2xl" />
      <div className="text-5xl" aria-hidden>
        {icon}
      </div>
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      <p className="text-ink-2">{body}</p>
      <ButtonLink href="/" variant="secondary">
        Back to Still Reading
      </ButtonLink>
    </main>
  );
}

export default function ChallengeLayout({ children }: { children: ReactNode }) {
  const { challengeId } = useParams<{ challengeId: string }>();
  const view = useChallengeView(challengeId);
  const [checkInOpen, setCheckInOpen] = useState(false);

  useEffect(() => {
    track("challenge_viewed", { challengeId });
    void getSyncEngine().sync();
  }, [challengeId]);

  if (view === undefined) {
    return (
      <main className="mx-auto max-w-lg px-4 pt-8">
        <PageSkeleton />
      </main>
    );
  }
  if (view === null) {
    return <FullPageMessage icon="🔎" title="This challenge isn't on this device" body="Open the invite link from your friend to join, or go back to your challenges." />;
  }
  if (view.challenge.access === "removed") {
    return <FullPageMessage icon="🚪" title="You no longer have access to this challenge." body="If you think this is a mistake, talk to the host." />;
  }
  if (view.challenge.access === "left") {
    return <FullPageMessage icon="👋" title="You left this challenge" body="Use the invite link again if you'd like to rejoin." />;
  }
  if (view.challenge.access === "gone") {
    return <FullPageMessage icon="📕" title="This challenge is no longer available" body="Ask the host for a new invite link." />;
  }

  return (
    <ChallengeContext.Provider value={{ view, openCheckIn: () => setCheckInOpen(true) }}>
      <ChallengeHeader view={view} />
      <main className="mx-auto max-w-lg space-y-4 px-4 pb-32 pt-4">
        <OfflineBanner />
        <SyncFailures />
        {children}
      </main>
      <BottomNav challengeId={challengeId} />
      <CheckInComposer view={view} open={checkInOpen} onClose={() => setCheckInOpen(false)} />
    </ChallengeContext.Provider>
  );
}
