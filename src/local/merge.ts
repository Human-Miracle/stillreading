import type { BookDTO, ChallengeSnapshot, EntityKind, GoalDTO, ParticipantDTO, ReactionDTO, SessionDTO } from "@/lib/api-types";
import { getLocalDb, type LocalChallenge, type LocalSession, type StillReadingDB } from "./db";

type Table = StillReadingDB["participants"] | StillReadingDB["goals"] | StillReadingDB["books"] | StillReadingDB["sessions"] | StillReadingDB["reactions"];

function tableFor(db: StillReadingDB, kind: Exclude<EntityKind, "challenge">): Table {
  switch (kind) {
    case "participant":
      return db.participants;
    case "goal":
      return db.goals;
    case "book":
      return db.books;
    case "session":
      return db.sessions;
    case "reaction":
      return db.reactions;
  }
}

/** Server rows win unless the local copy has unsynced changes (the queued op will settle it). */
async function mergeRows<T extends { id: string }>(db: StillReadingDB, kind: Exclude<EntityKind, "challenge">, rows: T[], force = false) {
  if (!rows.length) return;
  const table = tableFor(db, kind) as unknown as StillReadingDB["books"];
  const existing = await table.bulkGet(rows.map((r) => r.id));
  const puts = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const local = existing[i] as (typeof existing)[number] & Partial<LocalSession>;
    if (!force && local && local.syncStatus !== "synced") continue;
    const merged: Record<string, unknown> = { ...row, syncStatus: "synced" };
    if (kind === "session") {
      // Keep a private reflection that only exists on this device.
      const s = row as unknown as SessionDTO;
      const keepPrivate = local && local.reflectionShared === false && local.reflection;
      merged.reflection = keepPrivate ? local.reflection : s.reflection;
      merged.reflectionShared = keepPrivate ? false : true;
    }
    puts.push(merged);
  }
  if (puts.length) await table.bulkPut(puts as never);
}

export async function applySnapshot(snapshot: ChallengeSnapshot, opts: { joinedNow?: boolean } = {}) {
  const db = getLocalDb();
  await db.transaction("rw", [db.challenges, db.participants, db.goals, db.books, db.sessions, db.reactions], async () => {
    const prev = await db.challenges.get(snapshot.challenge.id);
    const challenge: LocalChallenge = {
      ...snapshot.challenge,
      myParticipantId: snapshot.me.participantId,
      cursor: snapshot.cursor,
      access: "ok",
      lastPulledAt: new Date().toISOString(),
      joinedLocallyAt: prev?.joinedLocallyAt ?? new Date().toISOString(),
    };
    await db.challenges.put(challenge);
    await mergeRows<ParticipantDTO>(db, "participant", snapshot.participants, opts.joinedNow);
    await mergeRows<GoalDTO>(db, "goal", snapshot.goals, opts.joinedNow);
    await mergeRows<BookDTO>(db, "book", snapshot.books, opts.joinedNow);
    await mergeRows<SessionDTO>(db, "session", snapshot.sessions);
    await mergeRows<ReactionDTO>(db, "reaction", snapshot.reactions);
  });
}

/** Adopt the server's copy returned by a push (ok/duplicate/stale). */
export async function applyServerRecord(kind: EntityKind, record: unknown, opts: { force: boolean }) {
  const db = getLocalDb();
  if (kind === "challenge") {
    const c = record as LocalChallenge;
    await db.challenges.update(c.id, { name: c.name, description: c.description, status: c.status, updatedAt: c.updatedAt });
    return;
  }
  const row = record as { id: string };
  const pendingForEntity = await db.syncQueue.where("entityId").equals(row.id).count();
  // Another queued op for the same entity will carry newer local state; don't clobber it.
  if (pendingForEntity > 0 && !opts.force) return;
  await db.transaction("rw", [db.participants, db.goals, db.books, db.sessions, db.reactions, db.syncQueue], () =>
    mergeRows(db, kind, [row], true),
  );
}

export async function markEntitySynced(kind: EntityKind, entityId: string) {
  const db = getLocalDb();
  if (kind === "challenge") return;
  const remaining = await db.syncQueue.where("entityId").equals(entityId).count();
  if (remaining > 0) return;
  await (tableFor(db, kind) as unknown as StillReadingDB["books"]).update(entityId, { syncStatus: "synced" });
}

export async function markEntityFailed(kind: EntityKind, entityId: string) {
  const db = getLocalDb();
  if (kind === "challenge") return;
  await (tableFor(db, kind) as unknown as StillReadingDB["books"]).update(entityId, { syncStatus: "failed" });
}
