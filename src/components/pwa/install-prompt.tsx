"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";
import { getPref, setPref } from "@/local/device";
import { Button } from "../ui/button";
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
    <section className="animate-rise rounded-[1.75rem] bg-lavender px-5 pb-5 pt-4">
      <p className="eyebrow text-ink/55">Install</p>
      <p className="mt-1.5 text-[17px] leading-snug tracking-[-0.015em]">
        Want Still Reading on your home screen?{" "}
        <span className="text-ink/60">
          {canPrompt ? "Open your challenge in one tap, even offline." : "Tap Share, then Add to Home Screen."}
        </span>
      </p>
      <div className="mt-4 flex gap-2">
        {canPrompt ? (
          <Button
            size="sm"
            onClick={async () => {
              await promptInstall();
              await dismiss();
            }}
          >
            Install Still Reading
          </Button>
        ) : null}
        <Button size="sm" variant="glass" onClick={dismiss}>
          {canPrompt ? "Maybe later" : "Got it"}
        </Button>
      </div>
    </section>
  );
}
