"use client";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";

/** The app's version (package.json), shown in settings as e.g. "V1.0.2". */
export const APP_VERSION = `V${process.env.NEXT_PUBLIC_APP_VERSION || "dev"}`;

async function registration() {
  try {
    return (await navigator.serviceWorker?.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

/** Resolves once the registration has no service worker installing (or after `ms`). */
function settled(reg: ServiceWorkerRegistration, ms: number) {
  return new Promise<void>((resolve) => {
    const sw = reg.installing;
    if (!sw) return resolve();
    const timer = setTimeout(resolve, ms);
    sw.addEventListener("statechange", () => {
      if (sw.state === "activated" || sw.state === "redundant") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/** Fetches the newest version of the app (if there is one) and reloads onto it. */
export async function refreshApp() {
  const reg = await registration();
  if (reg) {
    await reg.update().catch(() => undefined);
    await settled(reg, 8000);
  }
  window.location.reload();
}

/**
 * Installed apps can stay open (suspended) for days, so the browser rarely checks for a new version
 * on its own. Check every time the app is opened or brought back to the front. The service worker
 * activates new versions straight away; this reloads onto it: immediately if the app is in the
 * background, otherwise via a "new version" toast, or the next time the app comes back to the front.
 */
export function AppUpdater() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    // The very first install (nothing controlling the page yet) also fires controllerchange; that's
    // not an update. A page that got its first worker during this visit still sees later updates.
    let controller = sw.controller;
    let updated = false;

    const onControllerChange = () => {
      const previous = controller;
      controller = sw.controller;
      if (!previous || updated) return;
      updated = true;
      if (document.visibilityState === "hidden") window.location.reload();
      else setReady(true);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (updated) {
        window.location.reload();
        return;
      }
      void registration().then((reg) => reg?.update().catch(() => undefined));
    };

    sw.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisible);
    onVisible();
    return () => {
      sw.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!ready) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 mx-auto flex max-w-[440px] px-4">
      <div className="pointer-events-auto flex w-full animate-rise items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-float" role="status">
        <p>
          <span className="font-medium">A new version is ready.</span> <span className="text-white/65">Refresh to get the latest.</span>
        </p>
        <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
