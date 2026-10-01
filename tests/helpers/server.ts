import { sql } from "drizzle-orm";
import { createPgliteDb, setDb, type Database } from "@/db/client";
import { POST as createChallengePOST } from "@/app/api/challenges/route";
import { GET as pullGET } from "@/app/api/challenges/[id]/sync/route";
import { GET as previewGET, POST as joinPOST } from "@/app/api/join/[code]/route";
import { POST as pushPOST } from "@/app/api/sync/route";
import { POST as eventsPOST } from "@/app/api/events/route";
import { GET as bookSearchGET } from "@/app/api/books/search/route";
import { DEVICE_HEADER, SECRET_HEADER } from "@/lib/api-types";
import { newDeviceSecret, newId } from "@/lib/ids";

process.env.STILLREADING_DISABLE_RATE_LIMIT ??= "1";

export async function freshDb(): Promise<Database> {
  const db = await createPgliteDb();
  setDb(db);
  return db;
}

export async function resetDb(db: Database) {
  await db.execute(
    sql`truncate table reactions, reading_sessions, books, goals, challenge_participants, challenges, devices, processed_operations, rate_limits, product_events cascade`,
  );
}

export interface TestDevice {
  deviceId: string;
  secret: string;
}

export function newDevice(): TestDevice {
  return { deviceId: newId("dvc"), secret: newDeviceSecret() };
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [
  { method: "POST", pattern: /^\/api\/challenges$/, keys: [], handler: createChallengePOST as Handler },
  { method: "GET", pattern: /^\/api\/challenges\/([^/]+)\/sync$/, keys: ["id"], handler: pullGET as Handler },
  { method: "GET", pattern: /^\/api\/join\/([^/]+)$/, keys: ["code"], handler: previewGET as Handler },
  { method: "POST", pattern: /^\/api\/join\/([^/]+)$/, keys: ["code"], handler: joinPOST as Handler },
  { method: "POST", pattern: /^\/api\/sync$/, keys: [], handler: pushPOST as Handler },
  { method: "POST", pattern: /^\/api\/events$/, keys: [], handler: eventsPOST as Handler },
  { method: "GET", pattern: /^\/api\/books\/search$/, keys: [], handler: bookSearchGET as Handler },
];

/** A `fetch` that dispatches straight into the Next.js route handlers. */
export const handlerFetch: typeof fetch = async (input, init) => {
  const req = new Request(new URL(String(input instanceof Request ? input.url : input), "http://stillreading.test"), init);
  const url = new URL(req.url);
  for (const r of routes) {
    const m = r.method === req.method ? url.pathname.match(r.pattern) : null;
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
    return r.handler(req, { params: Promise.resolve(params) });
  }
  return new Response("not found", { status: 404 });
};

export async function api<T = unknown>(method: string, path: string, opts: { device?: TestDevice; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.device) {
    headers[DEVICE_HEADER] = opts.device.deviceId;
    headers[SECRET_HEADER] = opts.device.secret;
  }
  const res = await handlerFetch(path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

export const nowIso = () => new Date().toISOString();

export function goalInput(kind: "pages_per_day" | "every_day" | "books" | "minutes_per_day" = "pages_per_day", value = 20) {
  const t = nowIso();
  return { id: newId("gl"), priority: "primary" as const, preset: { kind, value }, createdAt: t, updatedAt: t };
}

export function bookInput(title = "Atomic Habits") {
  const t = nowIso();
  return { id: newId("bk"), title, author: "James Clear", totalPages: 320, currentPage: 0, status: "reading" as const, createdAt: t, updatedAt: t };
}

export function createBody(overrides: { startDate?: string; durationDays?: number; timezone?: string; name?: string } = {}) {
  const tz = overrides.timezone ?? "Africa/Lagos";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  return {
    opId: newId("op"),
    challenge: {
      name: overrides.name ?? "October Reading Challenge",
      description: "30 days of reading together.",
      startDate: overrides.startDate ?? today,
      durationDays: overrides.durationDays ?? 30,
      timezone: tz,
    },
    host: { participantId: newId("pt"), displayName: "Jessica" },
    goal: goalInput(),
    book: bookInput(),
  };
}

export function joinBody(name = "David") {
  return { opId: newId("op"), participantId: newId("pt"), displayName: name, goal: goalInput("minutes_per_day", 30), book: null };
}
