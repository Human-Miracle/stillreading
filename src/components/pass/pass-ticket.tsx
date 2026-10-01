"use client";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { renderPassImage } from "./pass-image";

/** The pass as a coat-check ticket: lavender stub, perforation, four words + number. */
export function PassTicket({ pass, hidden = false, className }: { pass: string; hidden?: boolean; className?: string }) {
  const words = pass.split("-");
  return (
    <div className={cn("relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(180deg,#bdbcfa_0%,#dddcf9_100%)] px-6 pb-5 pt-5", className)}>
      <p className="eyebrow text-ink/55">Reading Pass</p>
      <p className="display mt-3 text-[34px] leading-[1.02] tabular" aria-label={hidden ? "Reading Pass hidden" : `Reading Pass: ${words.join(" ")}`}>
        {words.map((w, i) => (
          <span key={i} className="block">
            {hidden ? "•".repeat(Math.min(w.length, 7)) : w}
          </span>
        ))}
      </p>
      <div className="relative mt-5 h-0 border-t-2 border-dashed border-ink/20" aria-hidden>
        <span className="absolute -left-9 -top-3 size-6 rounded-full bg-surface" />
        <span className="absolute -right-9 -top-3 size-6 rounded-full bg-surface" />
      </div>
      <p className="mt-4 flex items-center gap-2 text-sm text-ink/60">
        <span className="size-2 rounded-full bg-signal" aria-hidden /> Keep it private. It&apos;s your way back in.
      </p>
    </div>
  );
}

/** Copy + save-as-image actions. Calls `onSaved` after either succeeds. */
export function PassActions({ pass, onSaved }: { pass: string; onSaved?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const blob = await renderPassImage(pass, window.location.host);
              const file = new File([blob], "still-reading-pass.png", { type: "image/png" });
              if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: "My Reading Pass" });
              } else {
                const url = URL.createObjectURL(blob);
                setPreview(url);
                const a = document.createElement("a");
                a.href = url;
                a.download = "still-reading-pass.png";
                a.click();
              }
              onSaved?.();
            } catch {
              // share sheet cancelled
            } finally {
              setBusy(false);
            }
          }}
        >
          Save as image
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(pass);
            } catch {
              window.prompt("Copy your Reading Pass", pass);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            onSaved?.();
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Your Reading Pass image" className="w-full rounded-card shadow-soft" />
      ) : null}
    </div>
  );
}
