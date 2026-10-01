"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SegmentRing, type DayState } from "@/components/challenge/day-ring";
import { isStandalone } from "@/components/pwa/install-state";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { Wordmark } from "@/components/ui/misc";
import { challengeClock } from "@/lib/domain/dates";
import { useChallenges } from "@/local/hooks";

// A sample month: mostly goal days, a few partial and missed ones, today, then the days ahead.
const SAMPLE: DayState[] = [
  ..."mmmmrmm" + "mmmxmmm" + "mmrmmm",
].map((c) => (c === "m" ? "met" : c === "r" ? "read" : "missed")) as DayState[];
const ART: DayState[] = [...SAMPLE, "today", ...Array<DayState>(30 - SAMPLE.length - 1).fill("future")];

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

  const mine = (challenges ?? []).filter((c) => c.access === "ok").sort((a, b) => b.joinedLocallyAt.localeCompare(a.joinedLocallyAt));
  const open = mine.filter((c) => c.status !== "archived" && challengeClock(c).phase !== "ended");

  // Launched from the home screen: go straight into the active challenge.
  useEffect(() => {
    if (!challenges) return;
    const fromPwa = new URLSearchParams(window.location.search).get("source") === "pwa" || isStandalone();
    if (fromPwa && open.length === 1) router.replace(`/c/${open[0]!.id}`);
  }, [challenges, open, router]);

  return (
    <main className="mx-auto max-w-[440px] px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <nav className="flex items-center justify-between py-2">
        <Wordmark className="text-[19px]" />
        {mine.length ? (
          <a href="#your-challenges" className="text-sm text-ink/60">
            Your challenges
          </a>
        ) : null}
      </nav>

      <section className="pt-8">
        <div className="animate-rise">
          <SegmentRing states={ART} size={300} todayIndex={SAMPLE.length} label={null}>
            <div>
              <p className="display text-[96px] tabular">30</p>
              <p className="mt-1 text-sm text-ink/55">days of reading together</p>
            </div>
          </SegmentRing>
        </div>
        <h1 className="display mt-10 text-[56px] text-balance">
          Read together.
          <br />
          <span className="text-ink/35">Show up daily.</span>
        </h1>
        <p className="mt-5 max-w-[34ch] text-[17px] leading-snug text-ink/60">
          Read whatever you want. Set your own goal. Check in each day and watch your friends do the same.
        </p>

        <div className="mt-9 space-y-2.5">
          <ButtonLink href="/create" size="lg" full>
            Create a challenge
          </ButtonLink>
          {!joining ? (
            <Button variant="secondary" size="lg" full onClick={() => setJoining(true)}>
              Join a challenge
            </Button>
          ) : (
            <form
              className="animate-rise space-y-3 rounded-card bg-surface p-5 shadow-soft"
              onSubmit={(e) => {
                e.preventDefault();
                const code = parseInvite(invite);
                if (!code) return setInviteError("Paste the invite link your friend sent you.");
                router.push(`/join/${code}`);
              }}
            >
              <Field label="Invite link" error={inviteError}>
                {(p) => <Input {...p} autoFocus className="bg-surface-2 shadow-none" placeholder="https://…/join/…" value={invite} onChange={(e) => setInvite(e.target.value)} />}
              </Field>
              <Button type="submit" full>
                Continue
              </Button>
            </form>
          )}
        </div>
      </section>

      {mine.length ? (
        <section id="your-challenges" aria-labelledby="your-challenges-title" className="mt-14 rounded-sheet bg-surface px-5 pb-3 pt-6">
          <h2 id="your-challenges-title" className="headline text-[26px]">
            Your challenges
          </h2>
          <ul className="mt-2">
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
                <li key={c.id} className="dotted">
                  <Link href={`/c/${c.id}`} className="flex items-center gap-3 py-4">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px] font-medium tracking-[-0.02em]">{c.name}</span>
                      <span className="text-sm text-muted">{status}</span>
                    </span>
                    <Icon.chevron className="size-5 text-ink/40" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
