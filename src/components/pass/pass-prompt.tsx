"use client";
import { useState } from "react";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";
import { PassActions, PassTicket } from "./pass-ticket";
import { markPassPromptDone, useLocalReader } from "./use-reader";

/**
 * Home-screen reminder to save the Reading Pass. Shows until the reader saves it or skips; either way
 * the pass stays in Settings. This is how readers from before the pass existed receive theirs.
 */
export function PassPrompt() {
  const state = useLocalReader();
  const [open, setOpen] = useState(false);
  const pass = state?.reader?.pass;
  if (!state || !pass || state.promptDone) return null;

  return (
    <>
      <section className="animate-rise relative overflow-hidden rounded-[1.75rem] bg-butter px-5 pb-5 pt-4">
        <p className="eyebrow text-ink/55">New · Reading Pass</p>
        <p className="mt-1.5 max-w-[30ch] text-[17px] leading-snug tracking-[-0.015em]">
          Your progress now has a key. Save your Reading Pass to carry on from any phone, no sign-in.
        </p>
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>
            View my pass
          </Button>
          <Button size="sm" variant="glass" onClick={() => void markPassPromptDone()}>
            Skip
          </Button>
        </div>
      </section>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your Reading Pass">
        <div className="space-y-4">
          <p className="text-ink/60">Got a new phone? Open Still Reading, tap &ldquo;Use your Reading Pass&rdquo; and enter these words. Everything comes with you.</p>
          <PassTicket pass={pass} />
          <PassActions pass={pass} />
          <Button
            full
            size="lg"
            onClick={async () => {
              await markPassPromptDone();
              setOpen(false);
            }}
          >
            I&apos;ve saved it
          </Button>
          <p className="text-center text-sm text-muted">It&apos;s always in Settings too.</p>
        </div>
      </Sheet>
    </>
  );
}

/** Inline block for the "you're in" / "challenge ready" screens. */
export function PassOnboarding() {
  const state = useLocalReader();
  const pass = state?.reader?.pass;
  if (!pass) return null;
  return (
    <section className="animate-rise space-y-3" aria-labelledby="pass-onboarding-title">
      <div>
        <h2 id="pass-onboarding-title" className="headline text-[24px]">
          Here&apos;s your Reading Pass
        </h2>
        <p className="mt-1 text-ink/60">No account needed. These words bring your progress to any new phone. Save them somewhere safe.</p>
      </div>
      <PassTicket pass={pass} />
      <PassActions pass={pass} onSaved={() => void markPassPromptDone()} />
    </section>
  );
}
