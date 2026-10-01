"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isStandalone } from "@/components/pwa/install-state";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Wordmark } from "@/components/ui/misc";
import { challengeClock } from "@/lib/domain/dates";
import { useChallenges } from "@/local/hooks";

function parseInvite(input: string): string | null {
  const v = input.trim();
  const fromUrl = v.match(/\/join\/([0-9A-Za-z]{6,32})/);
  if (fromUrl) return fromUrl[1]!;
  return /^[0-9A-Za-z]{6,32}$/.test(v) ? v : null;
}

export default function Landing() {
  const router = useRouter();
  const challenges = useChallenges();
  const [joining, setJoining] = useState(false);
  const [invite, setInvite] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const mine = (challenges ?? [])
    .filter((c) => c.access === "ok")
    .sort((a, b) => b.joinedLocallyAt.localeCompare(a.joinedLocallyAt));
  const open = mine.filter((c) => c.status !== "archived" && challengeClock(c).phase !== "ended");

  // Launched from the home screen: go straight into the active challenge.
  useEffect(() => {
    if (!challenges) return;
    const fromPwa = new URLSearchParams(window.location.search).get("source") === "pwa" || isStandalone();
    if (fromPwa && open.length === 1) router.replace(`/c/${open[0]!.id}`);
  }, [challenges, open, router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
      <section className="flex flex-1 flex-col justify-center py-10">
        <Wordmark className="text-6xl" />
        <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.1] text-balance">
          Read together.
          <br />
          Show up for 30 days.
        </h1>
        <p className="mt-4 text-lg text-ink-2">Read whatever you want. Set your own goal. Check in daily and watch your friends do the same.</p>

        <div className="mt-8 space-y-3">
          <ButtonLink href="/create" size="lg" full>
            Create a challenge
          </ButtonLink>
          {!joining ? (
            <Button variant="secondary" size="lg" full onClick={() => setJoining(true)}>
              Join a challenge
            </Button>
          ) : (
            <Card className="animate-rise">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const code = parseInvite(invite);
                  if (!code) return setInviteError("Paste the invite link your friend sent you.");
                  router.push(`/join/${code}`);
                }}
                className="space-y-3"
              >
                <Field label="Invite link" error={inviteError}>
                  {(p) => <Input {...p} autoFocus placeholder="https://…/join/…" value={invite} onChange={(e) => setInvite(e.target.value)} />}
                </Field>
                <Button type="submit" full>
                  Continue
                </Button>
              </form>
            </Card>
          )}
        </div>
      </section>

      {mine.length ? (
        <section aria-labelledby="your-challenges" className="space-y-3">
          <h2 id="your-challenges" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            Your challenges
          </h2>
          {mine.map((c) => {
            const clock = challengeClock(c);
            const status =
              c.status === "archived"
                ? "Archived"
                : clock.phase === "upcoming"
                  ? `Starts in ${clock.startsInDays} day${clock.startsInDays === 1 ? "" : "s"}`
                  : clock.phase === "ended"
                    ? "Complete"
                    : `Day ${clock.dayNumber} of ${c.durationDays}`;
            return (
              <Link key={c.id} href={`/c/${c.id}`} className="flex items-center justify-between rounded-card border border-line bg-card px-5 py-4 shadow-card">
                <span className="font-display text-lg font-semibold">{c.name}</span>
                <span className="text-sm text-muted">{status} →</span>
              </Link>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
