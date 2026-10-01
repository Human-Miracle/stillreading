"use client";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    /** Captured by the inline head script before React loads (see app/layout.tsx). */
    __srInstall?: BeforeInstallPromptEvent | null;
  }
}

export const DISMISS_KEY = "sr-install-dismissed";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let modalOpen = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function listenForInstallPrompt(): () => void {
  if (window.__srInstall) {
    deferred = window.__srInstall;
    emit();
  }
  const onPrompt = (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  };
  const onInstalled = () => {
    deferred = null;
    window.__srInstall = null;
    installed = true;
    emit();
    void import("@/lib/analytics").then(({ track }) => track("pwa_installed"));
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function subscribeInstall(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const canPromptInstall = () => deferred !== null;
export const justInstalled = () => installed;
export const isInstallModalOpen = () => modalOpen;

export function setInstallModalOpen(open: boolean) {
  modalOpen = open;
  emit();
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  window.__srInstall = null;
  emit();
  await event.prompt();
  const accepted = (await event.userChoice).outcome === "accepted";
  if (accepted) {
    installed = true;
    emit();
  }
  return accepted;
}

/** True inside the installed app (any platform). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const modes = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];
  return (
    modes.some((m) => window.matchMedia(`(display-mode: ${m})`).matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith("android-app://")
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function dismissedThisVisit(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // private mode: the modal just won't remember within this visit
  }
}
