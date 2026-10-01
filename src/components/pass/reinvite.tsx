"use client";
import { useState } from "react";
import { ApiClientError, apiRequest } from "@/local/api";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";

/** Host-only: a one-time link for a member who lost both their phone and their Reading Pass. */
export function ReinviteButton({ challengeId, participantId, name }: { challengeId: string; participantId: string; name: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ token: string }>(`/api/challenges/${challengeId}/reinvite`, { method: "POST", body: { participantId } });
      setLink(`${window.location.origin}/pass?reinvite=${res.token}`);
    } catch (err) {
      setError(err instanceof ApiClientError && err.status === 0 ? "You're offline. Re-invites need a connection." : "Couldn't create a link. Try again.");
      setLink("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="ghost" disabled={busy} onClick={create}>
        Re-invite
      </Button>
      <Sheet open={link !== null} onClose={() => setLink(null)} title={`Re-invite ${name}`}>
        <div className="space-y-4">
          {error ? (
            <p className="text-[#c2321f]" role="alert">
              {error}
            </p>
          ) : (
            <>
              <p className="text-ink/60">
                For when {name} lost their phone and their Reading Pass. Send them this link: it works once, for 7 days, and brings back their check-ins in this challenge.
              </p>
              <p className="break-all rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-ink/70">{link}</p>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={async () => {
                    if (!link) return;
                    if (typeof navigator.share === "function") {
                      try {
                        await navigator.share({ title: "Still Reading", text: `Here's your link back into our challenge, ${name}:`, url: link });
                        return;
                      } catch {
                        // fall through to copy
                      }
                    }
                    await navigator.clipboard.writeText(link).catch(() => window.prompt("Copy this link", link));
                    setCopied(true);
                  }}
                >
                  {copied ? "Copied" : "Send link"}
                </Button>
              </div>
              <p className="text-sm text-muted">Only share it with {name}. Anyone with the link can step into their place.</p>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
