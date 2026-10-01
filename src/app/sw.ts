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
    // Book covers never change for a given id: keep them so shelves look right offline.
    {
      matcher: ({ url, request }) => url.hostname === "covers.openlibrary.org" && request.destination === "image",
      handler: new CacheFirst({
        cacheName: "stillreading-covers",
        plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: THIRTY_DAYS })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
