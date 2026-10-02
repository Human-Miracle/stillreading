// Creates the "October Reading Challenge" demo challenge with six readers and ~11 days of history.
// Usage: npm run db:seed   (stop `npm run dev` first when using local PGlite)
// Then open the printed invite link to join as a 7th reader and see the whole experience.
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { books, challenges, devices, goals, participants, reactions, readingSessions } from "../src/db/schema";
import { addDays, endDateFor, todayInTimezone } from "../src/lib/domain/dates";
import { goalFromPreset, type GoalPreset } from "../src/lib/domain/goals";
import type { SessionUnit } from "../src/lib/domain/types";
import { newDeviceSecret, newId, reactionId } from "../src/lib/ids";
import { hashSecret } from "../src/server/auth";

const JOIN_CODE = "DemoOctober30";
const TZ = "Africa/Lagos";
const DURATION = 30;
const DAYS_ELAPSED = 11; // today is day 12

interface Reader {
  name: string;
  goal: GoalPreset;
  unit: SessionUnit;
  books: string[];
  /** amount per day (index 0 = day 1); 0 = missed */
  pattern: (day: number) => number;
  reflections?: Record<number, string>;
}

const BOOKS: Record<string, { author: string; pages: number }> = {
  "Atomic Habits": { author: "James Clear", pages: 320 },
  "The Psychology of Money": { author: "Morgan Housel", pages: 256 },
  "Deep Work": { author: "Cal Newport", pages: 296 },
  "Things Fall Apart": { author: "Chinua Achebe", pages: 209 },
  "The Creative Act": { author: "Rick Rubin", pages: 432 },
};

const readers: Reader[] = [
  {
    name: "Jessica",
    goal: { kind: "pages_per_day", value: 20 },
    unit: "pages",
    books: ["Atomic Habits"],
    pattern: (d) => [22, 20, 25, 18, 20, 21, 20, 24, 20, 22, 20, 18][d] ?? 0,
    reflections: { 11: "The identity chapter was so good.", 7: "Habit stacking is going to change my mornings." },
  },
  {
    name: "David",
    goal: { kind: "pages_per_day", value: 20 },
    unit: "pages",
    books: ["The Psychology of Money"],
    pattern: (d) => [30, 24, 0, 26, 28, 22, 25, 30, 21, 24, 26, 24][d] ?? 0,
    reflections: { 11: "Enough is a powerful word." },
  },
  {
    name: "Amaka",
    goal: { kind: "chapters_per_day", value: 1 },
    unit: "chapters",
    books: ["Things Fall Apart"],
    pattern: (d) => [1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1][d] ?? 0,
    reflections: { 10: "Okonkwo is such a complicated character." },
  },
  {
    name: "Samuel",
    goal: { kind: "books", value: 2 },
    unit: "pages",
    books: ["Deep Work", "The Creative Act"],
    pattern: (d) => [40, 0, 35, 0, 50, 45, 0, 60, 0, 40, 0, 0][d] ?? 0,
  },
  {
    name: "Tolu",
    goal: { kind: "minutes_per_day", value: 30 },
    unit: "minutes",
    books: ["The Creative Act"],
    pattern: (d) => [30, 35, 30, 0, 0, 30, 40, 30, 30, 45, 30, 20][d] ?? 0,
  },
  {
    name: "Miriam",
    goal: { kind: "every_day", value: 1 },
    unit: "pages",
    books: ["Atomic Habits"],
    pattern: (d) => [10, 12, 8, 15, 10, 0, 0, 12, 14, 10, 9, 0][d] ?? 0,
  },
];

async function main() {
  // The demo uses a fixed, guessable invite code: never seed a real database by accident.
  if ((process.env.DATABASE_URL || process.env.VERCEL || process.env.NODE_ENV === "production") && !process.argv.includes("--force")) {
    console.error("Refusing to seed: DATABASE_URL points at a real database. Pass --force if this is a throwaway database.");
    process.exit(1);
  }
  const db = await getDb();
  const existing = await db.select().from(challenges).where(eq(challenges.publicJoinCode, JOIN_CODE));
  if (existing[0]) {
    await db.delete(challenges).where(eq(challenges.id, existing[0].id));
  }

  const today = todayInTimezone(TZ);
  const startDate = addDays(today, -DAYS_ELAPSED);
  const challengeId = newId("ch");
  await db.insert(challenges).values({
    id: challengeId,
    publicJoinCode: JOIN_CODE,
    name: "October Reading Challenge",
    description: "30 days of reading together. Any book counts. Show up, check in, cheer each other on.",
    startDate,
    endDate: endDateFor(startDate, DURATION),
    durationDays: DURATION,
    timezone: TZ,
  });

  const sessionIds: string[] = [];
  const participantIds: string[] = [];
  for (const [i, r] of readers.entries()) {
    const deviceId = newId("dvc");
    await db.insert(devices).values({ id: deviceId, secretHash: hashSecret(newDeviceSecret()) });
    const pid = newId("pt");
    participantIds.push(pid);
    const joinedAt = new Date(Date.now() - (DAYS_ELAPSED + 1) * 86_400_000 + i * 3_600_000);
    await db.insert(participants).values({ id: pid, challengeId, deviceId, displayName: r.name, role: i === 0 ? "host" : "participant", joinedAt });
    if (i === 0) await db.update(challenges).set({ hostParticipantId: pid }).where(eq(challenges.id, challengeId));
    await db.insert(goals).values({ id: newId("gl"), challengeId, participantId: pid, priority: "primary", ...goalFromPreset(r.goal, DURATION) });

    const bookIds: string[] = [];
    for (const [bi, title] of r.books.entries()) {
      const meta = BOOKS[title]!;
      const id = newId("bk");
      bookIds.push(id);
      const finished = r.books.length > 1 && bi === 0;
      await db.insert(books).values({
        id,
        challengeId,
        participantId: pid,
        title,
        author: meta.author,
        totalPages: meta.pages,
        currentPage: finished ? meta.pages : 0,
        status: finished ? "completed" : "reading",
        startedAt: joinedAt,
        completedAt: finished ? new Date(Date.now() - 4 * 86_400_000) : null,
      });
    }

    for (let d = 0; d <= DAYS_ELAPSED; d++) {
      const amount = r.pattern(d);
      if (!amount) continue;
      const date = addDays(startDate, d);
      const at = new Date(`${date}T19:${String(10 + i * 7).padStart(2, "0")}:00+01:00`);
      if (at > new Date()) continue;
      const id = newId("rs", at.getTime());
      sessionIds.push(id);
      await db.insert(readingSessions).values({
        id,
        challengeId,
        participantId: pid,
        bookId: bookIds[d > 6 && bookIds[1] ? 1 : 0]!,
        date,
        amount,
        unit: r.unit,
        // Minutes and chapters check-ins also record the pages they covered.
        pages: r.unit === "chapters" ? amount * 18 : r.unit === "minutes" ? Math.round(amount / 1.5) : null,
        reflection: r.reflections?.[d] ?? null,
        createdAt: at,
        updatedAt: at,
      });
    }
  }

  // A sprinkle of reactions on recent check-ins.
  const types = ["fire", "heart", "clap", "book"] as const;
  for (const [si, sessionId] of sessionIds.slice(-12).entries()) {
    for (const [pi, pid] of participantIds.entries()) {
      if ((si + pi) % 3 !== 0) continue;
      const type = types[(si + pi) % types.length]!;
      await db
        .insert(reactions)
        .values({ id: reactionId(sessionId, pid, type), challengeId, participantId: pid, readingSessionId: sessionId, type })
        .onConflictDoNothing();
    }
  }

  const base = process.env.APP_URL ?? "http://localhost:3000";
  console.log(`Seeded "October Reading Challenge" (day ${DAYS_ELAPSED + 1} of ${DURATION}) with ${readers.length} readers.`);
  console.log(`Join as a new reader: ${base}/join/${JOIN_CODE}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
