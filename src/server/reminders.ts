import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import webpush from "web-push";
import type { Database } from "@/db/client";
import { challenges, participants, readingSessions } from "@/db/schema";
import { todayInTimezone } from "@/lib/domain/dates";
import type { PushPayload } from "@/lib/validation/push";
import { log } from "./log";
import { sendToSubscriptions, subscriptionsFor, vapidConfig } from "./notifications";

/** At most one reminder per reader per challenge in this window, so it never feels like spam. */
export const REMINDER_GAP_MS = 5 * 60 * 60 * 1000;
/** Reminders only go out during the day in the challenge's timezone (8:00 to 21:59). */
export const REMINDER_HOURS = { from: 8, to: 21 } as const;

function hourIn(timezone: string, now: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number.parseInt(h, 10);
}

export function reminderPayload(challenge: { id: string; name: string }): PushPayload {
  return {
    title: "Time for today's reading 📖",
    body: `A few pages count. Log today's reading for ${challenge.name}.`,
    url: `/c/${challenge.id}`,
    tag: `reminder-${challenge.id}`,
  };
}

/**
 * Nudges readers who haven't logged any reading today. Runs on a schedule (every hour); each reader
 * gets at most one reminder per challenge every {@link REMINDER_GAP_MS}, only in daytime hours, only
 * while the challenge is running, and only if they turned notifications on and didn't turn reminders
 * off. Each reminder is claimed in the database before sending, so overlapping runs never double up.
 */
export async function sendReadingReminders(db: Database, now: Date = new Date()): Promise<{ due: number; sent: number; removed: number }> {
  const vapid = vapidConfig();
  if (!vapid) return { due: 0, sent: 0, removed: 0 };

  const running = (await db.select().from(challenges).where(eq(challenges.status, "active"))).filter((c) => {
    const today = todayInTimezone(c.timezone, now);
    const hour = hourIn(c.timezone, now);
    return today >= c.startDate && today <= c.endDate && hour >= REMINDER_HOURS.from && hour <= REMINDER_HOURS.to;
  });
  if (!running.length) return { due: 0, sent: 0, removed: 0 };

  const cutoff = new Date(now.getTime() - REMINDER_GAP_MS);
  const notRecentlyReminded = or(isNull(participants.lastRemindedAt), lte(participants.lastRemindedAt, cutoff));
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  let due = 0;
  let sent = 0;
  let removed = 0;
  for (const challenge of running) {
    const today = todayInTimezone(challenge.timezone, now);
    const candidates = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.challengeId, challenge.id),
          eq(participants.status, "active"),
          eq(participants.notifyReplies, true),
          eq(participants.notifyReminders, true),
          notRecentlyReminded,
        ),
      );
    if (!candidates.length) continue;
    const readToday = new Set(
      (
        await db
          .select({ id: readingSessions.participantId })
          .from(readingSessions)
          .where(
            and(
              eq(readingSessions.challengeId, challenge.id),
              eq(readingSessions.date, today),
              isNull(readingSessions.deletedAt),
              inArray(
                readingSessions.participantId,
                candidates.map((c) => c.id),
              ),
            ),
          )
      ).map((r) => r.id),
    );

    const payload = JSON.stringify(reminderPayload(challenge));
    for (const person of candidates.filter((p) => !readToday.has(p.id))) {
      const subs = await subscriptionsFor(db, person);
      if (!subs.length) continue;
      // Claim this reader's reminder first: a run that overlaps this one finds it already taken.
      const [claimed] = await db
        .update(participants)
        .set({ lastRemindedAt: now })
        .where(and(eq(participants.id, person.id), notRecentlyReminded))
        .returning({ id: participants.id });
      if (!claimed) continue;
      due += 1;
      const result = await sendToSubscriptions(db, subs, payload, `reminder-${challenge.id}`);
      sent += result.sent;
      removed += result.removed;
    }
  }
  log.info("reading_reminders", { challenges: running.length, due, sent, removed });
  return { due, sent, removed };
}
