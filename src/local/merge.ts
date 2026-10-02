import type { BookDTO, ChallengeSnapshot, EntityKind, GoalDTO, ParticipantDTO, ReactionDTO, ReplyDTO, SessionDTO } from "@/lib/api-types";
import { openNote } from "./crypto";
import { getLocalDb, type LocalChallenge, type LocalSession, type StillReadingDB } from "./db";

type Table =
  | StillReadingDB["participants"]
  | StillReadingDB["goals"]
  | StillReadingDB["books"]
  | StillReadingDB["sessions"]
  | StillReadingDB["reactions"]
  | StillReadingDB["replies"];

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
    case "reply":
      return db.replies;
  }
}

/** Server rows win unless the local copy has unsynced changes (the queued op will settle it). */
async function mergeRows<T extends { id: string }>(
  db: StillReadingDB,
  kind: Exclude<EntityKind, "challenge">,
  rows: T[],
  force = false,
  opened?: Map<string, string>,
) {
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
      const s = row as unknown as SessionDTO;
      const decrypted = opened?.get(s.id);
      const keepPrivate = local && local.reflectionShared === false && local.reflection;
      if (decrypted !== undefined) {
        // Private reflection written on another of this reader's devices.
        merged.reflection = decrypted;
        merged.reflectionShared = false;
        merged.privateSynced = true;
      } else if (keepPrivate) {
        // A private reflection this device already holds in plain text.
        merged.reflection = local.reflection;
        merged.reflectionShared = false;
        merged.privateSynced = local.privateSynced === true || Boolean(s.privateReflection);
      } else {
        merged.reflection = s.reflection;
        merged.reflectionShared = true;
      }
    }
    puts.push(merged);
  }
  if (puts.length) await table.bulkPut(puts as never);
}

/** Decrypt this reader's own private reflections (outside any Dexie transaction: Web Crypto is async). */
async function openPrivateNotes(sessions: SessionDTO[], myParticipantId: string): Promise<Map<string, string>> {
  const opened = new Map<string, string>();
  const sealed = sessions.filter((s) => s.privateReflection && s.participantId === myParticipantId);
  if (!sealed.length) return opened;
  const reader = (await getLocalDb().kv.get("reader"))?.value as { noteKey?: string | null } | undefined;
  if (!reader?.noteKey) return opened;
  await Promise.all(
    sealed.map(async (s) => {
      try {
        opened.set(s.id, await openNote(s.privateReflection!, reader.noteKey!));
      } catch {
        // Sealed with a key this device doesn't have; leave it.
      }
    }),
  );
  return opened;
}

export async function applySnapshot(snapshot: ChallengeSnapshot, opts: { joinedNow?: boolean } = {}) {
  const db = getLocalDb();
  const opened = await openPrivateNotes(snapshot.sessions, snapshot.me.participantId);
  await db.transaction("rw", [db.challenges, db.participants, db.goals, db.books, db.sessions, db.reactions, db.replies], async () => {
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
    await mergeRows<SessionDTO>(db, "session", snapshot.sessions, false, opened);
    await mergeRows<ReactionDTO>(db, "reaction", snapshot.reactions);
    await mergeRows<ReplyDTO>(db, "reply", snapshot.replies ?? []);
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
  await db.transaction("rw", [db.participants, db.goals, db.books, db.sessions, db.reactions, db.replies, db.syncQueue], () =>
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
