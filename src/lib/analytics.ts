import type { ProductEventName } from "@/lib/validation/api";

/** Fire-and-forget anonymous product event. Never blocks UI, never throws. */
export function track(name: ProductEventName, opts: { challengeId?: string; props?: Record<string, string | number | boolean> } = {}) {
  if (typeof window === "undefined" || navigator.onLine === false) return;
  try {
    const body = JSON.stringify({ name, challengeId: opts.challengeId, props: opts.props });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/events", blob)) {
      void fetch("/api/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    // analytics must never break the app
  }
}
