import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

/**
 * Content Security Policy (production). The device secret, Reading Pass and note key live in this
 * origin's IndexedDB, so the policy keeps any injected script from loading code or sending data
 * elsewhere: scripts, connections and frames are same-origin only; images may also come from Open
 * Library covers (which redirect to archive.org). Inline scripts are needed by Next.js streaming.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://covers.openlibrary.org https://archive.org https://*.archive.org",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Database drivers stay as runtime dependencies instead of being bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  poweredByHeader: false,
  // Shown in settings so readers can tell which build their installed app is running.
  env: { NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA ?? "" },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // No Cross-Origin-Opener-Policy on purpose: "same-origin" stops the page loading at all in
          // Instagram's and Facebook's in-app browsers on iOS ("This page couldn't load"), where many
          // invite links get opened. The app opens no popups, so it protects little here.
          // Dev mode needs eval for fast refresh, so the policy applies to production builds only.
          ...(isProd ? [{ key: "Content-Security-Policy", value: CSP }] : []),
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
