import { z } from "zod";

/**
 * Push services run by the browser vendors. The server sends requests to whatever endpoint a client
 * registers, so only these hosts are accepted: anything else could point the server at an internal
 * or third-party URL.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge on Android, Samsung Internet, Opera
  "android.googleapis.com",
  "updates.push.services.mozilla.com", // Firefox
  "push.services.mozilla.com",
  "web.push.apple.com", // Safari and iOS Home Screen apps
  ".push.apple.com",
  ".notify.windows.com", // Edge on Windows
] as const;

export function isAllowedPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => (h.startsWith(".") ? host.endsWith(h) && host.length > h.length : host === h));
}

const base64Url = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/, "Invalid key");

export const pushSubscriptionInput = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, "Unsupported push service"),
  keys: z.object({ p256dh: base64Url.max(200), auth: base64Url.max(100) }),
});

export const notificationSettingsBody = z.object({
  enabled: z.boolean(),
  subscription: pushSubscriptionInput.optional(),
});

/** What the service worker receives in a push message. */
export interface PushPayload {
  title: string;
  body: string;
  /** Same-origin path to open when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other (one per thread). */
  tag: string;
}
