"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { track } from "@/lib/analytics";
import { Button } from "../ui/button";
import { openHandoffSheet } from "./handoff-state";
import { cn } from "../ui/cn";
import { Icon } from "../ui/icons";
import {
  canPromptInstall,
  dismissedThisVisit,
  isInstallModalOpen,
  isStandalone,
  justInstalled,
  promptInstall,
  rememberDismissed,
  setInstallModalOpen,
  subscribeInstall,
} from "./install-state";
import { detectPlatform, type Platform } from "./platform";

const SHOW_DELAY_MS = 900;

type Env = { ua: string; platform: string; maxTouchPoints: number };
let cachedEnv: Env | null = null;
const noopSubscribe = () => () => {};
/** Browser facts never change during a visit, so read them once (client only). */
function readEnv(): Env {
  cachedEnv ??= { ua: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints };
  return cachedEnv;
}

/* Small inline glyphs that mirror what people will look for in their browser chrome. */
const Glyph = {
  share: (
    <svg viewBox="0 0 24 24" className="inline size-[1.15em] -translate-y-px" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  ),
  addSquare: (
    <svg viewBox="0 0 24 24" className="inline size-[1.15em] -translate-y-px" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  ),
  dots: <span className="inline-block rounded-md bg-ink/8 px-1.5 font-semibold leading-tight tracking-widest">•••</span>,
  kebab: <span className="inline-block rounded-md bg-ink/8 px-1.5 font-semibold leading-tight">⋮</span>,
  installDesktop: (
    <svg viewBox="0 0 24 24" className="inline size-[1.15em] -translate-y-px" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M12 7.5v6M9.5 11l2.5 2.5 2.5-2.5M8 21h8" />
    </svg>
  ),
};

const TONES = ["bg-butter", "bg-blush", "bg-sky", "bg-sage"];

function Steps({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3.5 text-[15px] leading-snug">
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-sm font-medium tabular", TONES[i % TONES.length])}>{i + 1}</span>
          <span className="pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function CopyLink({ label = "Copy link" }: { label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      full
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
        } catch {
          window.prompt("Copy this link", window.location.href);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

function PhoneQr() {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import("qrcode").then((QR) =>
      QR.toString(window.location.href, { type: "svg", margin: 0, color: { dark: "#111111", light: "#00000000" } }).then((s) => alive && setSvg(s)),
    );
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface-2 p-4">
      <div className="size-24 shrink-0 rounded-xl bg-white p-2" role="img" aria-label="QR code to open Still Reading on your phone" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
      <p className="text-[15px] leading-snug text-ink/70">
        <span className="font-medium text-ink">Best on your phone.</span> Scan with your camera, then install it there.
      </p>
    </div>
  );
}

function iosSafariSteps(p: Platform): ReactNode[] {
  const modern = (p.iosVersion ?? 26) >= 26;
  return [
    modern ? (
      <>
        Tap {Glyph.dots} in Safari&apos;s toolbar, then tap {Glyph.share} <b className="font-medium">Share</b>
      </>
    ) : (
      <>
        Tap {Glyph.share} <b className="font-medium">Share</b> in Safari&apos;s toolbar
      </>
    ),
    <>
      Scroll down and tap {Glyph.addSquare} <b className="font-medium">Add to Home Screen</b>
    </>,
    modern ? (
      <>
        Keep <b className="font-medium">Open as Web App</b> on, then tap <b className="font-medium">Add</b>
      </>
    ) : (
      <>
        Tap <b className="font-medium">Add</b> in the top corner
      </>
    ),
  ];
}

function Body({ platform, onInstalled }: { platform: Platform; onInstalled: () => void }) {
  const [busy, setBusy] = useState(false);
  switch (platform.method) {
    case "prompt":
      return (
        <div className="space-y-3">
          <Button
            size="lg"
            full
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              track("install_prompt_shown", { props: { method: "native" } });
              const ok = await promptInstall();
              setBusy(false);
              if (ok) onInstalled();
            }}
          >
            <Icon.plus className="size-5" strokeWidth={2} /> Install Still Reading
          </Button>
          <p className="text-center text-sm text-muted">Free · No account · Takes two seconds</p>
        </div>
      );
    case "ios-safari":
      return <Steps steps={iosSafariSteps(platform)} />;
    case "ios-browser":
      return (
        <Steps
          steps={[
            platform.browser === "Chrome" ? (
              <>
                Tap {Glyph.share} <b className="font-medium">Share</b> at the right of Chrome&apos;s address bar
              </>
            ) : (
              <>
                Open {platform.browser}&apos;s menu and tap {Glyph.share} <b className="font-medium">Share</b>
              </>
            ),
            <>
              Tap {Glyph.addSquare} <b className="font-medium">Add to Home Screen</b>
            </>,
            <>
              Tap <b className="font-medium">Add</b>
            </>,
          ]}
        />
      );
    case "ios-open-safari":
      return (
        <div className="space-y-3">
          <Steps
            steps={[
              <>
                Copy this link and open it in <b className="font-medium">Safari</b>
              </>,
              <>
                Tap {Glyph.share} <b className="font-medium">Share</b>, then {Glyph.addSquare} <b className="font-medium">Add to Home Screen</b>
              </>,
            ]}
          />
          <CopyLink label="Copy link for Safari" />
        </div>
      );
    case "android-menu":
      return (
        <Steps
          steps={[
            platform.browser === "Samsung Internet" ? (
              <>
                Tap the <b className="font-medium">≡ menu</b> at the bottom of the screen
              </>
            ) : (
              <>
                Tap {Glyph.kebab} in {platform.browser === "your browser" ? "your browser" : platform.browser}&apos;s top corner
              </>
            ),
            <>
              Tap <b className="font-medium">Install app</b> or <b className="font-medium">Add to Home screen</b>
            </>,
            <>
              Tap <b className="font-medium">Install</b> to confirm
            </>,
          ]}
        />
      );
    case "desktop-chromium":
      return (
        <div className="space-y-3">
          <Steps
            steps={[
              <>
                Click {Glyph.installDesktop} <b className="font-medium">Install</b> at the right end of the address bar
              </>,
              <>
                Or open the {Glyph.kebab} menu and choose <b className="font-medium">Install Still Reading</b>
              </>,
            ]}
          />
          <PhoneQr />
        </div>
      );
    case "desktop-safari":
      return (
        <div className="space-y-3">
          <Steps
            steps={[
              <>
                In the menu bar, choose <b className="font-medium">File → Add to Dock</b>
              </>,
              <>
                Click <b className="font-medium">Add</b>
              </>,
            ]}
          />
          <PhoneQr />
        </div>
      );
    case "desktop-unsupported":
      return (
        <div className="space-y-3">
          <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-[15px] leading-snug text-ink/70">
            {platform.browser} can&apos;t install apps on a computer. Use Chrome, Edge or Safari, or get it on your phone.
          </p>
          <PhoneQr />
        </div>
      );
    case "in-app":
      return (
        <div className="space-y-3">
          <Steps
            steps={[
              <>
                Tap {platform.os === "android" ? Glyph.kebab : Glyph.dots} in the corner of {platform.inApp}
              </>,
              <>
                Choose <b className="font-medium">{platform.os === "ios" ? "Open in Safari" : "Open in browser"}</b>
              </>,
              <>Install from there. It takes a few seconds.</>,
            ]}
          />
          <CopyLink />
        </div>
      );
  }
}

function headlineFor(p: Platform): { title: string; sub: string } {
  if (p.method === "in-app") return { title: "Open in your browser to install", sub: `${p.inApp}'s built-in browser can't add apps to your home screen.` };
  if (p.os === "desktop") return { title: "Still Reading, one click away", sub: "Install it for a full-screen app that opens straight into your challenge." };
  return { title: "Still Reading, one tap away", sub: "Add it to your home screen. It opens full screen, straight into your challenge." };
}

/**
 * Install modal shown on every visit until the app is installed. People can always skip it; skipping
 * hides it for the rest of this visit only. Never shown inside the installed app.
 */
export function InstallModal() {
  const hasPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const open = useSyncExternalStore(subscribeInstall, isInstallModalOpen, () => false);
  const installed = useSyncExternalStore(subscribeInstall, justInstalled, () => false);
  const env = useSyncExternalStore(noopSubscribe, readEnv, () => null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isStandalone() || dismissedThisVisit()) return;
    const t = setTimeout(() => {
      setInstallModalOpen(true);
      track("install_prompt_shown");
    }, SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const platform = useMemo(() => (env ? detectPlatform({ ...env, hasPrompt }) : null), [env, hasPrompt]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open, platform]);

  const close = () => {
    rememberDismissed();
    setInstallModalOpen(false);
  };

  if (!platform) return null;
  const { title, sub } = headlineFor(platform);
  const pointToToolbar = platform.method === "ios-safari" && !/iPad/i.test(env?.ua ?? "") && !(env?.platform === "MacIntel");

  return (
    <dialog
      ref={ref}
      aria-labelledby="install-title"
      onClose={() => open && close()}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      className="m-0 mt-auto max-h-[96dvh] w-full max-w-none overflow-y-auto rounded-t-sheet bg-surface p-0 text-ink shadow-float sm:mx-auto sm:mb-auto sm:max-w-[420px] sm:rounded-sheet"
    >
      {open ? (
        <div className="animate-rise">
          <div className="relative rounded-t-sheet bg-[linear-gradient(180deg,#bdbcfa_0%,#d3d2fb_55%,var(--surface)_100%)] px-6 pb-4 pt-6">
            <button type="button" onClick={close} aria-label="Close" className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/60 backdrop-blur-md hover:bg-white/80">
              <Icon.close />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" width={72} height={72} className="size-[72px] rounded-[1.35rem] shadow-[0_10px_30px_rgb(17_17_17/0.18)]" />
            {installed ? (
              <>
                <h2 id="install-title" tabIndex={-1} autoFocus className="display mt-6 text-[40px] outline-none">
                  You&apos;re all set
                </h2>
                <p className="mt-3 text-[17px] leading-snug text-ink/60">Still Reading is on your home screen. Open it from there next time.</p>
              </>
            ) : (
              <>
                <p className="mt-6 text-sm text-ink/55">Install the app</p>
                <h2 id="install-title" tabIndex={-1} autoFocus className="display mt-1 text-[40px] text-balance outline-none">
                  {title}
                </h2>
                <p className="mt-3 text-[17px] leading-snug text-ink/60">{sub}</p>
                <ul className="mt-5 flex flex-wrap gap-2 text-[13px]">
                  {["Works offline", "Full screen", "No app store"].map((b) => (
                    <li key={b} className="flex items-center gap-1 rounded-pill bg-white/60 px-3 py-1.5 backdrop-blur-md">
                      <Icon.check className="size-3.5" strokeWidth={2.4} />
                      {b}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="space-y-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
            {installed ? (
              <Button size="lg" full onClick={() => setInstallModalOpen(false)}>
                Done
              </Button>
            ) : (
              <>
                <Body platform={platform} onInstalled={() => undefined} />
                <Button variant="ghost" full onClick={close}>
                  Not now
                </Button>
                {platform.os !== "desktop" ? (
                  <button
                    type="button"
                    className="block w-full py-1 text-center text-sm text-ink/60"
                    onClick={() => {
                      close();
                      openHandoffSheet();
                    }}
                  >
                    Already have the app? <span className="font-medium text-ink">Open it</span>
                  </button>
                ) : null}
                {pointToToolbar ? (
                  <div className={cn("flex text-ink/40", (platform.iosVersion ?? 26) >= 26 ? "justify-end pr-2" : "justify-center")} aria-hidden>
                    <svg viewBox="0 0 24 24" className="size-7 animate-bounce" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 4v15M6 13l6 6 6-6" />
                    </svg>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

/** Opens the modal again on demand (e.g. from settings). */
export function openInstallModal() {
  setInstallModalOpen(true);
}
