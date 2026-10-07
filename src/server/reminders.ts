import { and, eq, inArray, isNull, lte, ne, or } from "drizzle-orm";
import webpush from "web-push";
import type { Database } from "@/db/client";
import { challenges, participants, readingSessions, type ChallengeRow, type ParticipantRow } from "@/db/schema";
import { addDays, joinedDateFor, participantStart, todayInTimezone } from "@/lib/domain/dates";
import { backfillCost, timeStoneWallet, type StoneSessionLike } from "@/lib/domain/time-stones";
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

export function timeStonePayload(challenge: { id: string; name: string }): PushPayload {
  return {
    title: "Use your Time Stone ⏳",
    body: `You missed yesterday in ${challenge.name}. Log it before midnight to keep your streak.`,
    url: `/c/${challenge.id}?log=yesterday`,
    tag: `reminder-${challenge.id}`,
  };
}

/**
 * Whether this reader should be nudged to spend a Time Stone: yesterday was one of their challenge
 * days, has no check-in, needs a stone and they hold one, and they haven't been nudged about it yet.
 */
function timeStoneDue(challenge: ChallengeRow, person: ParticipantRow, mine: StoneSessionLike[], yesterday: string, now: Date): boolean {
  if (person.stoneRemindedFor === yesterday) return false;
  if (yesterday < participantStart(challenge, joinedDateFor(challenge, person))) return false;
  return backfillCost(mine, yesterday, challenge.timezone, now) === "stone" && timeStoneWallet(mine).held > 0;
}

/**
 * Nudges readers who haven't logged any reading today. Runs on a schedule (every hour); each reader
 * gets at most one reminder per challenge every {@link REMINDER_GAP_MS}, only in daytime hours, only
 * while the challenge is running, and only if they turned notifications on and didn't turn reminders
 * off. Each reminder is claimed in the database before sending, so overlapping runs never double up.
 *
 * A reader who missed yesterday and holds a Time Stone gets "Use your Time Stone" instead (whether or
 * not they've read today), once per missed day: it's their last day to bring yesterday back.
 */
export async function sendReadingReminders(db: Database, now: Date = new Date()): Promise<{ due: number; stones: number; sent: number; removed: number }> {
  const vapid = vapidConfig();
  if (!vapid) return { due: 0, stones: 0, sent: 0, removed: 0 };

  const running = (await db.select().from(challenges).where(eq(challenges.status, "active"))).filter((c) => {
    const today = todayInTimezone(c.timezone, now);
    const hour = hourIn(c.timezone, now);
    return today >= c.startDate && today <= c.endDate && hour >= REMINDER_HOURS.from && hour <= REMINDER_HOURS.to;
  });
  if (!running.length) return { due: 0, stones: 0, sent: 0, removed: 0 };

  const cutoff = new Date(now.getTime() - REMINDER_GAP_MS);
  const notRecentlyReminded = or(isNull(participants.lastRemindedAt), lte(participants.lastRemindedAt, cutoff));
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  let due = 0;
  let stones = 0;
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
    const yesterday = addDays(today, -1);
    // Every check-in of theirs in this challenge (deleted ones too: a spent stone stays spent).
    const sessionsBy = new Map<string, StoneSessionLike[]>();
    const rows = await db
      .select({ participantId: readingSessions.participantId, date: readingSessions.date, createdAt: readingSessions.createdAt, deletedAt: readingSessions.deletedAt, timeStone: readingSessions.timeStone })
      .from(readingSessions)
      .where(
        and(
          eq(readingSessions.challengeId, challenge.id),
          inArray(
            readingSessions.participantId,
            candidates.map((c) => c.id),
          ),
        ),
      );
    for (const r of rows) {
      const list = sessionsBy.get(r.participantId) ?? [];
      list.push({ date: r.date, createdAt: r.createdAt.toISOString(), deletedAt: r.deletedAt?.toISOString() ?? null, timeStone: r.timeStone });
      sessionsBy.set(r.participantId, list);
    }

    for (const person of candidates) {
      const mine = sessionsBy.get(person.id) ?? [];
      const stone = timeStoneDue(challenge, person, mine, yesterday, now);
      if (!stone && mine.some((s) => s.date === today && !s.deletedAt)) continue;
      const subs = await subscriptionsFor(db, person);
      if (!subs.length) continue;
      // Claim this reader's reminder first: a run that overlaps this one finds it already taken.
      const [claimed] = await db
        .update(participants)
        .set(stone ? { lastRemindedAt: now, stoneRemindedFor: yesterday } : { lastRemindedAt: now })
        .where(
          and(
            eq(participants.id, person.id),
            notRecentlyReminded,
            stone ? or(isNull(participants.stoneRemindedFor), ne(participants.stoneRemindedFor, yesterday)) : undefined,
          ),
        )
        .returning({ id: participants.id });
      if (!claimed) continue;
      due += 1;
      if (stone) stones += 1;
      const result = await sendToSubscriptions(db, subs, JSON.stringify(stone ? timeStonePayload(challenge) : reminderPayload(challenge)), `reminder-${challenge.id}`);
      sent += result.sent;
      removed += result.removed;
    }
  }
  log.info("reading_reminders", { challenges: running.length, due, stones, sent, removed });
  return { due, stones, sent, removed };
}
