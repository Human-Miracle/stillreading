import { apiRequest } from "./api";
import { newNoteKey, openNote, sealNote } from "./crypto";
import { getLocalDb } from "./db";
import { claimWithPass, ensureReadingPass } from "./reader";
import { getSyncEngine } from "./sync/engine";

/**
 * "Open in the app": phones won't let a website launch an installed web app, and on iPhone the
 * browser and the Home Screen app don't even share storage. So the browser copies a one-time link;
 * the app reads it ("Paste from browser") and becomes the same reader, with all their progress.
 *
 *   https://<site>/continue#t=<token>&k=<key>&to=<path>
 *
 * The server only ever holds the Reading Pass sealed with `k`, which lives in the URL fragment
 * (never sent to any server). Single use, 15 minutes.
 */

export interface Handoff {
  token: string | null;
  key: string | null;
  to: string | null;
}

const SAFE_PATH = /^\/(?:c\/ch_[0-9A-Za-z]{26}(?:\/[A-Za-z0-9_/-]*)?|join\/[0-9A-Za-z]{6,32}|pass)?$/;
export const safePath = (p: string | null | undefined): string | null => (p && SAFE_PATH.test(p) ? p : null);

/** Browser side. Pushes any unsynced progress first, then builds the link to copy. */
export async function createHandoffLink(path: string, origin = window.location.origin): Promise<string> {
  const to = safePath(path) ?? "/";
  const params = new URLSearchParams({ to });
  const hasChallenges = (await getLocalDb().challenges.count()) > 0;
  if (hasChallenges) {
    await getSyncEngine()
      .sync()
      .catch(() => undefined);
    const reader = await ensureReadingPass().catch(() => null);
    if (reader?.pass) {
      const key = newNoteKey();
      const blob = await sealNote(JSON.stringify({ v: 1, pass: reader.pass }), key);
      const { token } = await apiRequest<{ token: string }>("/api/handoff", { method: "POST", body: { blob } });
      params.set("t", token);
      params.set("k", key);
    }
  }
  return `${origin}/continue#${params}`;
}

/** Understands a copied handoff link, or a plain invite / challenge link from this site. */
export function parseHandoff(text: string, origin = window.location.origin): Handoff | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  if (url.pathname === "/continue") {
    const p = new URLSearchParams(url.hash.slice(1));
    const token = p.get("t");
    const key = p.get("k");
    const ok = token && key && /^[A-Za-z0-9_-]{24}$/.test(token) && /^[A-Za-z0-9_-]{43}$/.test(key);
    return { token: ok ? token : null, key: ok ? key : null, to: safePath(p.get("to")) };
  }
  const to = safePath(url.pathname);
  return to ? { token: null, key: null, to } : null;
}

/** App side. Becomes the browser's reader (if the link carries one) and says where to go next. */
export async function completeHandoff(h: Handoff): Promise<string> {
  if (h.token && h.key) {
    const { blob } = await apiRequest<{ blob: string }>("/api/handoff/claim", { method: "POST", body: { token: h.token } });
    const { pass } = JSON.parse(await openNote(blob, h.key)) as { pass: string };
    const ids = await claimWithPass(pass);
    if (h.to?.startsWith("/c/") && !ids.some((id) => h.to!.startsWith(`/c/${id}`))) return ids[0] ? `/c/${ids[0]}` : "/";
    return h.to ?? (ids[0] ? `/c/${ids[0]}` : "/");
  }
  return h.to ?? "/";
}
