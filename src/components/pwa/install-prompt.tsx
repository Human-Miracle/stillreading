"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";
import { getPref, setPref } from "@/local/device";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstall } from "./install-state";

/** Contextual install card: only after a successful join/create, and only until dismissed. */
export function InstallPrompt() {
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const [eligible, setEligible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    void (async () => {
      const pending = await getPref("installPromptPending", false);
      const dismissed = await getPref("installPromptDismissed", false);
      setIos(isIos());
      setEligible(pending && !dismissed && !isStandalone());
    })();
  }, []);

  const visible = eligible && (canPrompt || ios);
  useEffect(() => {
    if (visible) track("install_prompt_shown");
  }, [visible]);
  if (!visible) return null;

  const dismiss = async () => {
    setEligible(false);
    await setPref("installPromptDismissed", true);
  };

  return (
    <Card className="animate-rise border-accent/30 bg-accent-soft/60">
      <p className="font-display text-xl font-semibold">Want Still Reading on your home screen?</p>
      {canPrompt ? (
        <p className="mt-1 text-ink-2">Open your challenge in one tap, even offline.</p>
      ) : (
        <p className="mt-1 text-ink-2">
          Tap <span className="font-semibold">Share</span> <span aria-hidden>⬆︎</span> then <span className="font-semibold">Add to Home Screen</span>.
        </p>
      )}
      <div className="mt-4 flex gap-2">
        {canPrompt ? (
          <Button
            onClick={async () => {
              await promptInstall();
              await dismiss();
            }}
          >
            Install Still Reading
          </Button>
        ) : null}
        <Button variant="ghost" onClick={dismiss}>
          {canPrompt ? "Maybe later" : "Got it"}
        </Button>
      </div>
    </Card>
  );
}
