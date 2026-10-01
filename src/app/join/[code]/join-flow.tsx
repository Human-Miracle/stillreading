"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProfileSteps } from "@/components/challenge/profile-steps";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Notice, PageSkeleton, Wordmark } from "@/components/ui/misc";
import { StreakBanner } from "@/components/challenge/streak-banner";
import { track } from "@/lib/analytics";
import type { JoinPreview } from "@/lib/api-types";
import { participantDuration, todayInTimezone } from "@/lib/domain/dates";
import { formatDateKey } from "@/lib/format";
import { ApiClientError, apiRequest } from "@/local/api";
import { getLocalDb } from "@/local/db";
import { joinChallenge, type ProfileInput } from "@/local/repo";
import { ensureReadingPass } from "@/local/reader";
import { PassOnboarding } from "@/components/pass/pass-prompt";

type Stage = "preview" | "profile" | "joined";

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  invalid_invite: { title: "This invite link isn't valid.", body: "Ask the challenge host for a new link." },
  ended: { title: "This challenge has ended.", body: "Ask your friends to start another one." },
  archived: { title: "This challenge has been archived.", body: "Ask the host to start a new one." },
  removed: { title: "You no longer have access to this challenge.", body: "If you think this is a mistake, talk to the host." },
  full: { title: "This challenge is full.", body: "Ask the host to start another one." },
  offline: { title: "You're offline.", body: "Joining needs a connection. Try again when you're back online." },
};

export function JoinFlow({ code, initialPreview }: { code: string; initialPreview: JoinPreview | null }) {
  const router = useRouter();
  const [preview, setPreview] = useState<JoinPreview | null>(initialPreview);
  const [localChallengeId, setLocalChallengeId] = useState<string | null | undefined>(undefined);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("preview");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinedId, setJoinedId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const local = await getLocalDb().challenges.where("joinCode").equals(code).first();
      setLocalChallengeId(local && local.access === "ok" ? local.id : null);
      try {
        setPreview(await apiRequest<JoinPreview>(`/api/join/${encodeURIComponent(code)}`));
        setErrorCode(null);
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.status === 0) setErrorCode((prev) => prev ?? (initialPreview ? null : "offline"));
          else setErrorCode(err.code);
        }
      }
    })();
  }, [code, initialPreview]);

  const join = async (profile: ProfileInput) => {
    setSubmitting(true);
    setError(null);
    try {
      const snap = await joinChallenge(code, profile);
      track("challenge_joined", { challengeId: snap.challenge.id });
      track("goal_selected", { challengeId: snap.challenge.id, props: { kind: profile.goal.kind } });
      if (profile.book) track("book_added", { challengeId: snap.challenge.id });
      setJoinedId(snap.challenge.id);
      void ensureReadingPass().catch(() => undefined);
      setStage("joined");
    } catch (err) {
      if (err instanceof ApiClientError && ERROR_COPY[err.code]) setErrorCode(err.code);
      else if (err instanceof ApiClientError && err.status === 0) setError(ERROR_COPY.offline!.body);
      else setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Server knows this device is a member but local data is gone: re-joining restores it (idempotent).
  const restore = async () => {
    setSubmitting(true);
    try {
      const snap = await joinChallenge(code, { displayName: "Reader", goal: { kind: "every_day", value: 1 } });
      router.push(`/c/${snap.challenge.id}`);
    } catch {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto max-w-[440px] px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <nav className="mb-8 py-2">
        <Link href="/" aria-label="Still Reading home">
          <Wordmark className="text-[19px]" />
        </Link>
      </nav>
      {children}
    </main>
  );

  if (errorCode && ERROR_COPY[errorCode] && stage !== "joined") {
    const copy = ERROR_COPY[errorCode]!;
    return shell(
      <section className="animate-rise space-y-5 pt-10">
        <h1 className="display text-[48px]">{copy.title}</h1>
        <p className="text-[17px] text-ink/60">{copy.body}</p>
        <ButtonLink href="/">Back to Still Reading</ButtonLink>
      </section>,
    );
  }

  if (!preview) return shell(<PageSkeleton />);
  const { challenge } = preview;

  if (stage === "joined") {
    return shell(
      <section className="animate-rise space-y-6 pt-4">
        <div>
          <div className="grid size-20 animate-pop place-items-center rounded-full bg-sage" aria-hidden>
            <Icon.check className="size-9" strokeWidth={2} />
          </div>
          <h1 className="display mt-8 text-[56px]">You&apos;re in</h1>
          <p className="mt-3 text-[17px] text-ink/60">Welcome to {challenge.name}. Your reading crew is waiting.</p>
        </div>
        <PassOnboarding />
        <Button full size="lg" onClick={() => router.push(`/c/${joinedId}`)}>
          Open my challenge
        </Button>
      </section>,
    );
  }

  if (stage === "profile") {
    return shell(
      <ProfileSteps
        durationDays={participantDuration(challenge, todayInTimezone(challenge.timezone))}
        stepOffset={0}
        totalSteps={3}
        submitLabel="Join challenge"
        submitting={submitting}
        error={error}
        onBack={() => setStage("preview")}
        onSubmit={join}
      />,
    );
  }

  const memberOnServer = preview.membership?.status === "active";
  const others = preview.participantCount;
  return shell(
    <section className="animate-rise">
      <div className="rounded-sheet bg-[linear-gradient(180deg,#bdbcfa_0%,#d6d5fb_60%,#e6e4f7_100%)] px-6 pb-7 pt-6">
        <StreakBanner title={preview.hostName ? `Started by ${preview.hostName}` : "You're invited"} sub={`${others} ${others === 1 ? "person is" : "people are"} already reading`} />
        <h1 className="display mt-10 text-[52px] text-balance">{challenge.name}</h1>
        <p className="mt-3 text-[17px] text-ink/60">{challenge.durationDays} days of reading together.</p>
        <p className="mt-8 text-sm text-ink/55">
          {formatDateKey(challenge.startDate, { month: "short", day: "numeric" })} – {formatDateKey(challenge.endDate, { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>
      <div className="space-y-3 px-1 pt-6 text-[17px] leading-snug text-ink/70">
        {challenge.description ? <p className="whitespace-pre-line">“{challenge.description}”</p> : null}
        <p>Everyone chooses their own goal and their own book.</p>
      </div>

      <div className="mt-8 space-y-3">
        {localChallengeId ? (
          <ButtonLink href={`/c/${localChallengeId}`} size="lg" full>
            Open my challenge
          </ButtonLink>
        ) : memberOnServer ? (
          <Button size="lg" full disabled={submitting} onClick={restore}>
            Open my challenge
          </Button>
        ) : preview.phase === "ended" || preview.phase === "archived" ? (
          <Notice>{ERROR_COPY[preview.phase]!.title} You can&apos;t join anymore.</Notice>
        ) : (
          <Button size="lg" full onClick={() => setStage("profile")} disabled={localChallengeId === undefined}>
            Join the challenge
          </Button>
        )}
        {!localChallengeId && !memberOnServer ? (
          <Link href="/pass" className="block py-2 text-center text-sm text-ink/60">
            Already in this challenge on another phone? <span className="font-medium text-ink">Use your Reading Pass</span>
          </Link>
        ) : null}
      </div>
    </section>,
  );
}
