import { waitUntil } from "@vercel/functions";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import webpush from "web-push";
import type { Database } from "@/db/client";
import { challenges, devices, participants, pushSubscriptions, readingSessions, replies, type PushSubscriptionRow } from "@/db/schema";
import type { PushPayload } from "@/lib/validation/push";
import { errorFields, log } from "./log";

const DEFAULT_SUBJECT = "https://github.com/pwadeveloper/stillreading";

interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** VAPID keys from the environment; null when push isn't configured (the feature then hides itself). */
export function vapidConfig(): Vapid | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || DEFAULT_SUBJECT };
}

// ---------------------------------------------------------------------------
// Work that runs after the response (Vercel keeps the function alive for it)
// ---------------------------------------------------------------------------

const pending = new Set<Promise<void>>();

/**
 * Runs `task` without delaying the response. Failures are logged, never thrown. `waitUntil` must be
 * called synchronously while the request is still running, or Vercel may freeze the function before
 * the task finishes.
 */
export function afterResponse(name: string, task: () => Promise<void>) {
  const p = task()
    .catch((err) => log.error(`${name}_failed`, errorFields(err)))
    .finally(() => pending.delete(p));
  pending.add(p);
  try {
    waitUntil(p);
  } catch {
    // Outside a Vercel request (local dev, tests): the promise simply runs to completion.
  }
}

/** Test hook: wait for every background task started so far. */
export async function settleBackgroundTasks() {
  while (pending.size) await Promise.all([...pending]);
}

// ---------------------------------------------------------------------------
// Reply notifications
// ---------------------------------------------------------------------------

const preview = (s: string, max = 140) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** owner: their check-in; parent: the reply this one answers; thread: someone else in the thread. */
export type ReplyAudience = "owner" | "parent" | "thread";

const TITLES: Record<ReplyAudience, (name: string) => string> = {
  parent: (n) => `${n} replied to you`,
  owner: (n) => `${n} replied to your check-in`,
  thread: (n) => `${n} also replied`,
};

export function replyPayload(input: { replier: string; body: string; to: ReplyAudience; challengeId: string; sessionId: string }): PushPayload {
  return {
    title: TITLES[input.to](input.replier),
    body: preview(input.body),
    url: `/c/${input.challengeId}/feed/${input.sessionId}`,
    tag: `thread-${input.sessionId}`,
  };
}

/**
 * Notifies everyone following a thread about a new reply: the check-in's owner and anyone who has
 * replied there, minus the replier, limited to active members who turned reply notifications on.
 * Each reply is claimed once (`notified_at`), so retried sync ops never notify twice.
 */
export async function notifyReply(db: Database, replyId: string): Promise<{ sent: number; removed: number }> {
  const vapid = vapidConfig();
  if (!vapid) return { sent: 0, removed: 0 };

  const [reply] = await db
    .update(replies)
    .set({ notifiedAt: sql`now()` })
    .where(and(eq(replies.id, replyId), isNull(replies.notifiedAt), isNull(replies.deletedAt)))
    .returning();
  if (!reply) return { sent: 0, removed: 0 };

  const [session] = await db.select({ ownerId: readingSessions.participantId }).from(readingSessions).where(eq(readingSessions.id, reply.readingSessionId));
  const [challenge] = await db.select({ status: challenges.status }).from(challenges).where(eq(challenges.id, reply.challengeId));
  if (!session || !challenge || challenge.status === "archived") return { sent: 0, removed: 0 };

  const coRepliers = await db
    .selectDistinct({ id: replies.participantId })
    .from(replies)
    .where(and(eq(replies.readingSessionId, reply.readingSessionId), isNull(replies.deletedAt)));
  const [parent] = reply.parentId ? await db.select({ authorId: replies.participantId }).from(replies).where(eq(replies.id, reply.parentId)) : [];
  const followerIds = [...new Set([session.ownerId, ...(parent ? [parent.authorId] : []), ...coRepliers.map((r) => r.id)])].filter((id) => id !== reply.participantId);
  if (!followerIds.length) return { sent: 0, removed: 0 };

  const people = await db
    .select({ id: participants.id, displayName: participants.displayName, deviceId: participants.deviceId, readerId: participants.readerId, status: participants.status, notify: participants.notifyReplies })
    .from(participants)
    .where(or(inArray(participants.id, followerIds), eq(participants.id, reply.participantId)));
  const replier = people.find((p) => p.id === reply.participantId);
  const recipients = people.filter((p) => p.id !== reply.participantId && p.status === "active" && p.notify);
  if (!replier || !recipients.length) return { sent: 0, removed: 0 };

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  let sent = 0;
  let removed = 0;
  for (const person of recipients) {
    const subs = await subscriptionsFor(db, person);
    const payload = JSON.stringify(
      replyPayload({
        replier: replier.displayName,
        body: reply.body,
        to: person.id === parent?.authorId ? "parent" : person.id === session.ownerId ? "owner" : "thread",
        challengeId: reply.challengeId,
        sessionId: reply.readingSessionId,
      }),
    );
    for (const sub of subs) {
      const { result } = await deliver(sub, payload, reply.readingSessionId);
      if (result === "sent") sent += 1;
      if (result === "gone") {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
        removed += 1;
      }
    }
  }
  log.info("reply_notified", { recipients: recipients.length, sent, removed });
  return { sent, removed };
}

/** Subscriptions on the member's own device, plus any other device signed in with the same Reading Pass. */
async function subscriptionsFor(db: Database, person: { deviceId: string; readerId: string | null }): Promise<PushSubscriptionRow[]> {
  const deviceIds = [person.deviceId];
  if (person.readerId) {
    const siblings = await db.select({ id: devices.id }).from(devices).where(and(eq(devices.readerId, person.readerId), ne(devices.id, person.deviceId)));
    deviceIds.push(...siblings.map((d) => d.id));
  }
  return db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.deviceId, deviceIds));
}

export interface Delivery {
  result: "sent" | "gone" | "failed";
  host: string;
  status: number | null;
  /** The push service's explanation when it refused (e.g. Apple's "BadJwtToken"). */
  detail: string | null;
}

async function deliver(sub: PushSubscriptionRow, payload: string, topic: string): Promise<Delivery> {
  const host = new URL(sub.endpoint).hostname;
  try {
    const res = await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
      TTL: 60 * 60 * 24,
      urgency: "normal",
      // Push services keep only the newest pending message per topic: one per thread.
      topic: topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32),
    });
    return { result: "sent", host, status: (res as { statusCode?: number } | undefined)?.statusCode ?? null, detail: null };
  } catch (err) {
    const e = err as { statusCode?: number; body?: unknown; message?: string };
    const status = e.statusCode ?? null;
    const detail = (typeof e.body === "string" && e.body.trim() ? e.body.trim() : (e.message ?? "")).slice(0, 200) || null;
    // 404/410: the browser unsubscribed or the app was removed. Forget the address.
    if (status === 404 || status === 410) return { result: "gone", host, status, detail };
    log.warn("push_failed", { status, host, detail });
    return { result: "failed", host, status, detail };
  }
}

/** Sends a test notification to this member's devices right away and reports what each push service said. */
export async function sendTestNotification(db: Database, person: { deviceId: string; readerId: string | null }, challengeId: string): Promise<Delivery[]> {
  const vapid = vapidConfig();
  if (!vapid) return [];
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const payload: PushPayload = {
    title: "Still Reading",
    body: "Notifications are working. You'll hear here when someone replies.",
    url: `/c/${challengeId}/settings`,
    tag: "test",
  };
  const deliveries: Delivery[] = [];
  for (const sub of await subscriptionsFor(db, person)) {
    const d = await deliver(sub, JSON.stringify(payload), "test");
    if (d.result === "gone") await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
    deliveries.push(d);
  }
  log.info("test_notification", { deliveries: deliveries.map((d) => `${d.host}:${d.result}:${d.status ?? "-"}`) });
  return deliveries;
}
