"use client";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { inviteUrl } from "@/lib/format";
import { Button } from "../ui/button";

export function InviteActions({ joinCode, challengeName, challengeId, full = true }: { joinCode: string; challengeName: string; challengeId: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(joinCode);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this invite link", url);
    }
    setCopied(true);
    track("invite_link_copied", { challengeId });
    setTimeout(() => setCopied(false), 2500);
  };

  const share = async () => {
    try {
      await navigator.share({ title: challengeName, text: `Join me for ${challengeName} 📚 Read whatever you want, set your own goal, and let's show up together.`, url });
      track("invite_link_copied", { challengeId, props: { via: "share" } });
    } catch {
      // cancelled
    }
  };

  return (
    <div className="space-y-2.5">
      <p className="truncate rounded-field bg-paper-2 px-4 py-3 font-mono text-sm text-ink-2" aria-label="Invite link">
        {url}
      </p>
      <div className={full ? "grid gap-2.5 sm:grid-cols-2" : "flex gap-2"}>
        <Button full={full} onClick={copy} aria-live="polite">
          {copied ? "Copied ✓" : "Copy invite link"}
        </Button>
        {canShare ? (
          <Button full={full} variant="secondary" onClick={share}>
            Share
          </Button>
        ) : null}
      </div>
    </div>
  );
}
