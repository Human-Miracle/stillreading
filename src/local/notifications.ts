"use client";
import { useCallback, useEffect, useState } from "react";
import { isIos, isStandalone } from "@/components/pwa/install-state";
import { apiRequest } from "./api";

/**
 * - unavailable: push isn't configured on the server (no VAPID keys), so the feature hides itself
 * - unsupported: this browser can't do Web Push
 * - needs-install: iPhone/iPad in Safari; push only works in the Home Screen app
 * - denied: the reader blocked notifications for the app
 * - off / on: reply notifications for this challenge on this device
 */
export type NotifyStatus = "loading" | "unavailable" | "unsupported" | "needs-install" | "denied" | "off" | "on";

let publicKeyPromise: Promise<string | null> | null = null;

function publicKey(): Promise<string | null> {
  publicKeyPromise ??= apiRequest<{ publicKey: string | null }>("/api/push/config", { auth: false })
    .then((r) => r.publicKey)
    .catch(() => {
      publicKeyPromise = null;
      return null;
    });
  return publicKeyPromise;
}

function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function readStatus(challengeId: string): Promise<NotifyStatus> {
  const key = await publicKey();
  if (!key) return "unavailable";
  if (!pushSupported()) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const [server, sub] = await Promise.all([
    apiRequest<{ enabled: boolean; thisDevice: boolean }>(`/api/challenges/${challengeId}/notifications`),
    currentSubscription(),
  ]);
  return server.enabled && server.thisDevice && sub && Notification.permission === "granted" ? "on" : "off";
}

/** Reply notifications for one challenge on this device. `enable` must run from a tap. */
export function useReplyNotifications(challengeId: string) {
  const [status, setStatus] = useState<NotifyStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    readStatus(challengeId)
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus("unavailable"));
    return () => {
      live = false;
    };
  }, [challengeId]);

  const enable = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      // Ask first, while the tap still counts as a user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const key = await publicKey();
      if (!key) return setStatus("unavailable");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
      await apiRequest(`/api/challenges/${challengeId}/notifications`, { method: "PUT", body: { enabled: true, subscription: sub.toJSON() } });
      setStatus("on");
    } catch {
      setError("Couldn't turn on notifications. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [challengeId]);

  const disable = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest(`/api/challenges/${challengeId}/notifications`, { method: "PUT", body: { enabled: false } });
      setStatus("off");
    } catch {
      setError("Couldn't turn off notifications. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [challengeId]);

  return { status, busy, error, enable, disable };
}

const promptKey = (challengeId: string) => `sr-notify-prompt-dismissed:${challengeId}`;

export function promptDismissed(challengeId: string): boolean {
  try {
    return localStorage.getItem(promptKey(challengeId)) === "1";
  } catch {
    return false;
  }
}

export function dismissPrompt(challengeId: string) {
  try {
    localStorage.setItem(promptKey(challengeId), "1");
  } catch {
    // ignore
  }
}

export interface Delivery {
  result: "sent" | "gone" | "failed";
  host: string;
  status: number | null;
  detail: string | null;
}

const SERVICE: [string, string][] = [
  ["apple.com", "Apple"],
  ["googleapis.com", "Google"],
  ["mozilla.com", "Mozilla"],
  ["windows.com", "Microsoft"],
];
const serviceName = (host: string) => SERVICE.find(([h]) => host.endsWith(h))?.[1] ?? host;

/** Plain-language summary of a test send. */
export function describeTest(deliveries: Delivery[]): { ok: boolean; message: string } {
  if (!deliveries.length) return { ok: false, message: "This device isn't registered for notifications. Turn them off and on again." };
  if (deliveries.some((d) => d.result === "sent")) {
    return {
      ok: true,
      message: "Sent. It should arrive within a few seconds. If it doesn't, check that notifications for Still Reading are allowed in your phone's settings and that Focus or Do Not Disturb is off.",
    };
  }
  if (deliveries.every((d) => d.result === "gone")) return { ok: false, message: "Your phone dropped this registration. Turn notifications off and on again." };
  const failed = deliveries.find((d) => d.result === "failed")!;
  return { ok: false, message: `${serviceName(failed.host)} refused the notification (${[failed.status, failed.detail].filter(Boolean).join(": ") || "no details"}).` };
}

export async function sendTest(challengeId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { deliveries } = await apiRequest<{ deliveries: Delivery[] }>(`/api/challenges/${challengeId}/notifications/test`, { method: "POST" });
    return describeTest(deliveries);
  } catch (err) {
    return { ok: false, message: err instanceof Error && err.message ? err.message : "Couldn't send a test. Check your connection and try again." };
  }
}
