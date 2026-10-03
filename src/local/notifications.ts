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

function sameKey(sub: PushSubscription, key: string): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return true; // Browser doesn't say: assume it's ours.
  const a = new Uint8Array(current);
  const b = keyBytes(key);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * This browser's push subscription for our key, creating it when missing. Without a granted permission
 * this must run straight from a tap: Safari on iPhone shows its permission prompt for it.
 */
async function subscribeNow(key: string): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing, key)) return existing;
  if (existing) await existing.unsubscribe().catch(() => undefined);
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
}

export interface LastDelivery {
  result: "sent" | "failed" | null;
  at: string;
  status: number | null;
  detail: string | null;
}

interface ServerSettings {
  enabled: boolean;
  reminders?: boolean;
  thisDevice: boolean;
  lastDelivery?: LastDelivery | null;
}

const endpointKey = (challengeId: string) => `sr-push-endpoint:${challengeId}`;
const synced = new Set<string>();

/**
 * Keeps the server's copy of this phone's push address current. Phones (iPhones especially) replace
 * their push address after updates or reinstalls; the server's old one then stops working, so on each
 * app open, if notifications are on, the current address is registered again (no prompt needed once
 * permission is granted).
 */
export async function syncPushSubscription(challengeId: string): Promise<void> {
  if (synced.has(challengeId) || !pushSupported() || Notification.permission !== "granted") return;
  synced.add(challengeId);
  try {
    const key = await publicKey();
    if (!key) return;
    const server = await apiRequest<ServerSettings>(`/api/challenges/${challengeId}/notifications`);
    if (!server.enabled) return;
    const sub = await subscribeNow(key);
    let known: string | null = null;
    try {
      known = localStorage.getItem(endpointKey(challengeId));
    } catch {
      // ignore
    }
    if (server.thisDevice && known === sub.endpoint) return;
    await apiRequest(`/api/challenges/${challengeId}/notifications`, { method: "PUT", body: { enabled: true, subscription: sub.toJSON() } });
    try {
      localStorage.setItem(endpointKey(challengeId), sub.endpoint);
    } catch {
      // ignore
    }
  } catch {
    synced.delete(challengeId); // Try again next time the app opens.
  }
}

async function readStatus(challengeId: string): Promise<{ status: NotifyStatus; reminders: boolean; lastDelivery: LastDelivery | null }> {
  const key = await publicKey();
  const none = { reminders: true, lastDelivery: null };
  if (!key) return { status: "unavailable", ...none };
  if (!pushSupported()) return { status: isIos() && !isStandalone() ? "needs-install" : "unsupported", ...none };
  if (Notification.permission === "denied") return { status: "denied", ...none };
  const [server, sub] = await Promise.all([apiRequest<ServerSettings>(`/api/challenges/${challengeId}/notifications`), currentSubscription()]);
  const on = server.enabled && server.thisDevice && sub && Notification.permission === "granted";
  return { status: on ? "on" : "off", reminders: server.reminders ?? true, lastDelivery: server.lastDelivery ?? null };
}

/** Reply notifications for one challenge on this device. `enable` must run from a tap. */
export function useReplyNotifications(challengeId: string) {
  const [status, setStatus] = useState<NotifyStatus>("loading");
  const [reminders, setRemindersState] = useState(true);
  const [lastDelivery, setLastDelivery] = useState<LastDelivery | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    readStatus(challengeId)
      .then((s) => {
        if (!live) return;
        setStatus(s.status);
        setRemindersState(s.reminders);
        setLastDelivery(s.lastDelivery);
      })
      .catch(() => live && setStatus("unavailable"));
    return () => {
      live = false;
    };
  }, [challengeId]);

  const enable = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const key = await publicKey();
      if (!key) return setStatus("unavailable");
      // Subscribe straight from the tap: the browser asks for permission as part of it (Safari on
      // iPhone needs this). Only if that's refused without asking do we ask separately.
      let sub: PushSubscription;
      try {
        sub = await subscribeNow(key);
      } catch (err) {
        if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            setStatus(permission === "denied" ? "denied" : "off");
            return;
          }
          sub = await subscribeNow(key);
        } else if (Notification.permission === "denied") {
          setStatus("denied");
          return;
        } else {
          throw err;
        }
      }
      await apiRequest(`/api/challenges/${challengeId}/notifications`, { method: "PUT", body: { enabled: true, subscription: sub.toJSON() } });
      try {
        localStorage.setItem(endpointKey(challengeId), sub.endpoint);
      } catch {
        // ignore
      }
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

  const setReminders = useCallback(
    async (on: boolean) => {
      setError(null);
      setRemindersState(on);
      try {
        await apiRequest(`/api/challenges/${challengeId}/notifications`, { method: "PUT", body: { reminders: on } });
      } catch {
        setRemindersState(!on);
        setError("Couldn't change reminders. Check your connection and try again.");
      }
    },
    [challengeId],
  );

  return { status, busy, error, enable, disable, reminders, setReminders, lastDelivery };
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
