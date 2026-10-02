/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import { CacheableResponsePlugin, CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const THIRTY_DAYS = 30 * 24 * 60 * 60;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // API traffic is handled by the app's own sync engine (IndexedDB), never cached here.
    { matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    // App pages: network first, fall back to the last copy so challenges open offline.
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "stillreading-pages",
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: THIRTY_DAYS })],
      }),
    },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.headers.get("RSC") === "1",
      handler: new NetworkFirst({
        cacheName: "stillreading-rsc",
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: THIRTY_DAYS })],
      }),
    },
    // Book covers (served from our own /covers route) never change for a given id: keep them so
    // shelves look right offline. Only real 200s are kept, so a failed load is retried next time.
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/covers/"),
      handler: new CacheFirst({
        cacheName: "stillreading-cover-images",
        plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: THIRTY_DAYS })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

// The previous cover cache stored opaque cross-origin responses, which could pin a failed load for
// weeks. Drop it; covers now come from the same-origin cache above.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("stillreading-covers"));
});

// ---------------------------------------------------------------------------
// Reply notifications (see server/notifications.ts for the payload)
// ---------------------------------------------------------------------------

interface ReplyPush {
  title?: unknown;
  body?: unknown;
  url?: unknown;
  tag?: unknown;
}

/** Only same-origin app paths are opened from a notification. */
function safePath(url: unknown): string {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

self.addEventListener("push", (event) => {
  let data: ReplyPush = {};
  try {
    data = (event.data?.json() as ReplyPush | undefined) ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Still Reading";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safePath((event.notification.data as { url?: unknown } | null)?.url), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if (open.url !== target) await open.navigate(target).catch(() => self.clients.openWindow(target));
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

serwist.addEventListeners();
