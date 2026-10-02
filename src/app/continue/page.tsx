"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StreakBanner } from "@/components/challenge/streak-banner";
import { ButtonLink } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/misc";
import { track } from "@/lib/analytics";
import { ApiClientError } from "@/local/api";
import { completeHandoff, parseHandoff } from "@/local/handoff";

function errorText(err: unknown) {
  if (err instanceof ApiClientError) {
    if (err.status === 0) return "You're offline. Connect to the internet and try again.";
    if (err.status === 429) return "Too many tries. Wait a few minutes and try again.";
    return err.message;
  }
  return "Something went wrong. Copy a fresh link from your browser and try again.";
}

/** Lands a browser → app handoff (see local/handoff.ts). The fragment never reaches the server. */
export default function ContinuePage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const handoff = parseHandoff(window.location.href);
    // Wipe the one-time key from the address bar and history.
    window.history.replaceState(null, "", "/continue");
    if (!handoff) {
      router.replace("/");
      return;
    }
    completeHandoff(handoff).then(
      (to) => {
        if (handoff.token) track("handoff_completed");
        router.replace(to);
      },
      (err) => setError(errorText(err)),
    );
  }, [router]);

  return (
    <main className="mx-auto max-w-[440px] px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <nav className="mb-8 py-2">
        <Link href="/" aria-label="Still Reading home">
          <Wordmark className="text-[19px]" />
        </Link>
      </nav>
      <div className="rounded-sheet bg-[linear-gradient(180deg,#bdbcfa_0%,#d6d5fb_60%,#e6e4f7_100%)] px-6 pb-7 pt-6">
        <StreakBanner title="Welcome to the app" sub="Bringing your reading over" />
        <h1 className="display mt-10 text-[44px]">{error ? "That didn't work" : "One moment…"}</h1>
        <p className="mt-3 text-[17px] leading-snug text-ink/60" role={error ? "alert" : "status"}>
          {error ?? "Moving your challenges, streaks and books into the app."}
        </p>
      </div>
      {error ? (
        <div className="mt-8 space-y-2">
          <ButtonLink href="/pass" size="lg" full>
            Use your Reading Pass instead
          </ButtonLink>
          <ButtonLink href="/" variant="ghost" full>
            Go to Still Reading
          </ButtonLink>
        </div>
      ) : null}
    </main>
  );
}
