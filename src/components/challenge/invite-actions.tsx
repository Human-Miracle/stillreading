"use client";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { inviteUrl } from "@/lib/format";
import { shareInvite } from "@/lib/invite";
import { Button } from "../ui/button";

export function InviteActions({ joinCode, challengeName, challengeId }: { joinCode: string; challengeName: string; challengeId: string; full?: boolean }) {
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

  return (
    <div className="space-y-3">
      <p className="truncate rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-ink/70" aria-label="Invite link">
        {url}
      </p>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={copy} aria-live="polite">
          {copied ? "Copied" : "Copy invite link"}
        </Button>
        {canShare ? (
          <Button variant="secondary" onClick={() => void shareInvite({ joinCode, name: challengeName, id: challengeId })}>
            Share
          </Button>
        ) : null}
      </div>
    </div>
  );
}
