"use client";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useCoverFill } from "@/components/books/use-cover-fill";
import { ChallengeContext } from "@/components/challenge/context";
import { BottomNav } from "@/components/challenge/nav";
import { CheckInComposer } from "@/components/check-in/check-in-composer";
import { SyncToasts } from "@/components/sync/offline-banner";
import { ButtonLink } from "@/components/ui/button";
import { PageSkeleton, Wordmark } from "@/components/ui/misc";
import { track } from "@/lib/analytics";
import { useChallengeView } from "@/local/hooks";
import { syncPushSubscription } from "@/local/notifications";
import { getSyncEngine } from "@/local/sync/engine";

function FullPageMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-[440px] flex-col justify-center gap-5 px-6">
      <Wordmark className="text-lg" />
      <h1 className="headline text-[40px]">{title}</h1>
      <p className="text-lg text-ink/60">{body}</p>
      <div>
        <ButtonLink href="/">Back to Still Reading</ButtonLink>
      </div>
    </main>
  );
}

export default function ChallengeLayout({ children }: { children: ReactNode }) {
  const { challengeId } = useParams<{ challengeId: string }>();
  const view = useChallengeView(challengeId);
  useCoverFill(challengeId, view?.challenge.access === "ok" ? view.members.flatMap((m) => m.books) : undefined);
  const [checkInOpen, setCheckInOpen] = useState(false);

  useEffect(() => {
    track("challenge_viewed", { challengeId });
    void getSyncEngine().sync();
    void syncPushSubscription(challengeId);
  }, [challengeId]);

  if (view === undefined) {
    return (
      <main className="mx-auto max-w-[440px]">
        <PageSkeleton />
      </main>
    );
  }
  if (view === null) {
    return <FullPageMessage title="This challenge isn't on this device" body="Open the invite link from your friend to join, or go back to your challenges." />;
  }
  if (view.challenge.access === "removed") {
    return <FullPageMessage title="You no longer have access to this challenge." body="If you think this is a mistake, talk to the host." />;
  }
  if (view.challenge.access === "left") {
    return <FullPageMessage title="You left this challenge" body="Use the invite link again if you'd like to rejoin." />;
  }
  if (view.challenge.access === "gone") {
    return <FullPageMessage title="This challenge is no longer available" body="Ask the host for a new invite link." />;
  }

  const canCheckIn = view.challenge.status !== "archived" && view.me?.progress.clock.phase === "active";
  return (
    <ChallengeContext.Provider value={{ view, openCheckIn: () => setCheckInOpen(true) }}>
      <main className="mx-auto min-h-dvh max-w-[440px] overflow-x-clip">{children}</main>
      <SyncToasts />
      <BottomNav challengeId={challengeId} onCheckIn={() => setCheckInOpen(true)} canCheckIn={canCheckIn} />
      <CheckInComposer view={view} open={checkInOpen} onClose={() => setCheckInOpen(false)} />
    </ChallengeContext.Provider>
  );
}
