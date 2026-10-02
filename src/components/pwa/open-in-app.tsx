"use client";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";
import { createHandoffLink, parseHandoff } from "@/local/handoff";
import { Button } from "../ui/button";
import { Icon } from "../ui/icons";
import { Sheet } from "../ui/sheet";
import { isHandoffSheetOpen, openHandoffSheet, setHandoffSheetOpen, subscribeHandoffSheet } from "./handoff-state";
import { isIos, isStandalone } from "./install-state";
import { openInstallModal } from "./install-modal";

/*
 * "Open in the Still Reading app", the way native apps do it with a banner. A website can't launch
 * a Home Screen web app, so the browser copies a one-time link and the app picks it up with
 * "Paste from browser" (see local/handoff.ts).
 */

const BAR_DISMISS_KEY = "sr-open-in-app-dismissed";

const noop = () => () => {};
const isMobile = () => typeof navigator !== "undefined" && (isIos() || /Android/i.test(navigator.userAgent));

function barDismissed() {
  try {
    return sessionStorage.getItem(BAR_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Slim bar on top of every page in a phone browser (never inside the app). */
export function OpenInAppBar() {
  const pathname = usePathname();
  const eligible = useSyncExternalStore(noop, () => isMobile() && !isStandalone() && !barDismissed(), () => false);
  const [hidden, setHidden] = useState(false);
  if (!eligible || hidden || pathname === "/continue") return null;
  return (
    <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-ink/5 bg-surface/90 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-xl">
      <button
        type="button"
        aria-label="Hide"
        className="-ml-1 grid size-7 shrink-0 place-items-center rounded-full text-ink/45"
        onClick={() => {
          try {
            sessionStorage.setItem(BAR_DISMISS_KEY, "1");
          } catch {
            // ignore
          }
          setHidden(true);
        }}
      >
        <Icon.close className="size-4" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={36} height={36} className="size-9 shrink-0 rounded-[0.6rem] shadow-soft" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[15px] font-semibold">Still Reading</p>
        <p className="truncate text-[13px] text-ink/55">Open in the app on your phone</p>
      </div>
      <Button size="sm" className="shrink-0 px-4" onClick={openHandoffSheet}>
        Open
      </Button>
    </div>
  );
}

/** Copies text produced asynchronously while keeping Safari's "user gesture" (ClipboardItem with a promise). */
async function copyAsync(make: () => Promise<string>): Promise<string> {
  const text = make();
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) })]);
      return text;
    } catch {
      // Fall through to writeText (Firefox, older Chrome).
    }
  }
  const value = await text;
  await navigator.clipboard.writeText(value);
  return value;
}

export function HandoffSheet() {
  const open = useSyncExternalStore(subscribeHandoffSheet, isHandoffSheetOpen, () => false);
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "working" | "copied" | "error">("idle");
  const [link, setLink] = useState<string | null>(null);
  const android = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const close = () => {
    setHandoffSheetOpen(false);
    setState("idle");
  };

  return (
    <Sheet open={open} onClose={close} title="Open in the app">
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={56} height={56} className="size-14 rounded-[1rem] shadow-soft" />
          <p className="text-[17px] leading-snug text-ink/70">Your challenges, streaks and books come with you. It takes a few seconds.</p>
        </div>

        <ol className="space-y-3 text-[15px]">
          {[
            "Tap Copy for the app below.",
            "Open Still Reading from your Home Screen.",
            android ? "Tap Paste from browser if it asks. Most of the time it's already there." : "Tap Paste from browser.",
          ].map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-butter text-xs font-semibold">{i + 1}</span>
              <span className={state === "copied" && i === 0 ? "text-muted line-through" : undefined}>{step}</span>
            </li>
          ))}
        </ol>

        {state === "copied" ? (
          <p role="status" className="rounded-card bg-sage/40 px-4 py-3 text-[15px]">
            Copied. Now open <b>Still Reading</b> from your Home Screen and tap <b>Paste from browser</b>. The link works once, for 15 minutes.
          </p>
        ) : null}
        {state === "error" ? (
          <p role="alert" className="rounded-card bg-blush/40 px-4 py-3 text-[15px]">
            Couldn&apos;t copy that. Check you&apos;re online and try again, or use your Reading Pass in the app.
            {link ? <span className="mt-2 block select-all break-all text-xs text-muted">{link}</span> : null}
          </p>
        ) : null}

        <div className="space-y-2">
          <Button
            size="lg"
            full
            disabled={state === "working"}
            onClick={async () => {
              setState("working");
              track("handoff_copied");
              try {
                setLink(await copyAsync(() => createHandoffLink(pathname)));
                setState("copied");
              } catch {
                setState("error");
              }
            }}
          >
            {state === "working" ? "Getting your reading ready…" : state === "copied" ? "Copy again" : "Copy for the app"}
          </Button>
          <Button
            variant="ghost"
            full
            onClick={() => {
              close();
              openInstallModal();
            }}
          >
            Don&apos;t have the app yet? Install it
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** Inside the installed app: pick up what was copied in the browser. */
export function PasteFromBrowser({ className }: { className?: string }) {
  const router = useRouter();
  const inApp = useSyncExternalStore(noop, isStandalone, () => false);
  const [error, setError] = useState<string | null>(null);
  if (!inApp) return null;
  return (
    <div className={className}>
      <Button
        variant="secondary"
        full
        onClick={async () => {
          setError(null);
          let text = "";
          try {
            text = await navigator.clipboard.readText();
          } catch {
            return setError("Allow paste to continue, or use your Reading Pass.");
          }
          const h = parseHandoff(text);
          if (!h) return setError("Nothing to bring over yet. In your browser, tap Open, then Copy for the app.");
          track("handoff_pasted");
          const params = new URLSearchParams();
          if (h.token && h.key) {
            params.set("t", h.token);
            params.set("k", h.key);
          }
          if (h.to) params.set("to", h.to);
          router.push(`/continue#${params}`);
        }}
      >
        Paste from browser
      </Button>
      {error ? <p className="mt-2 text-center text-sm text-muted">{error}</p> : null}
    </div>
  );
}
