import type { ChallengeSnapshot, ClaimResultDTO, ReaderStatusDTO } from "@/lib/api-types";
import { normalizePass } from "@/lib/pass";
import { newId } from "@/lib/ids";
import { ApiClientError, apiRequest } from "./api";
import { newNoteKey, sealNote, unwrapNoteKey, wrapNoteKey } from "./crypto";
import { getLocalDb, type SyncOpRecord } from "./db";
import { applySnapshot } from "./merge";
import { onLocalMutationNotify } from "./repo";

/** What this device knows about its reader. The pass is kept so it can always be shown in Settings. */
export interface LocalReader {
  readerId: string;
  /** null when the pass was changed on another device. */
  pass: string | null;
  passSetAt: string | null;
  /** Base64url AES key for private reflections. */
  noteKey: string | null;
}

const KEY = "reader";
const listeners = new Set<() => void>();
export function onReaderChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function getLocalReader(): Promise<LocalReader | null> {
  return ((await getLocalDb().kv.get(KEY))?.value as LocalReader | undefined) ?? null;
}

async function saveLocalReader(r: LocalReader) {
  await getLocalDb().kv.put({ key: KEY, value: r });
  listeners.forEach((fn) => fn());
}

/** Four random everyday words + two digits, e.g. MAPLE-TIDE-LANTERN-ORBIT-58. */
export async function generatePass(): Promise<string> {
  const { wordlist } = await import("@scure/bip39/wordlists/english.js");
  const words = Array.from(crypto.getRandomValues(new Uint16Array(4)), (n) => wordlist[n % 2048]!.toUpperCase());
  let digits = 100;
  while (digits >= 100) digits = crypto.getRandomValues(new Uint8Array(1))[0]! % 128;
  return `${words.join("-")}-${String(digits).padStart(2, "0")}`;
}

let ensuring: Promise<LocalReader | null> | null = null;

/**
 * Makes sure this device's reader has a Reading Pass, creating one the first time. Existing readers
 * (from before the pass existed) get theirs here automatically. Safe to call often; single-flight.
 */
export function ensureReadingPass(): Promise<LocalReader | null> {
  ensuring ??= doEnsure().finally(() => {
    ensuring = null;
  });
  return ensuring;
}

async function doEnsure(): Promise<LocalReader | null> {
  const status = await apiRequest<ReaderStatusDTO>("/api/reader");
  const local = await getLocalReader();
  if (!status.hasPass) {
    const noteKey = local?.noteKey ?? newNoteKey();
    for (let attempt = 0; attempt < 3; attempt++) {
      const pass = await generatePass();
      try {
        const saved = await apiRequest<ReaderStatusDTO>("/api/reader/pass", { method: "PUT", body: { pass, wrappedKey: await wrapNoteKey(noteKey, pass) } });
        const reader = { readerId: saved.readerId, pass, passSetAt: saved.passSetAt, noteKey };
        await saveLocalReader(reader);
        await backfillPrivateNotes();
        return reader;
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "collision") continue;
        if (err instanceof ApiClientError && err.code === "pass_exists") return doEnsure();
        throw err;
      }
    }
    return null;
  }
  const samePass = local?.readerId === status.readerId && local.passSetAt === status.passSetAt;
  const reader: LocalReader = {
    readerId: status.readerId,
    pass: samePass ? local!.pass : null,
    passSetAt: status.passSetAt,
    noteKey: local?.noteKey ?? null,
  };
  if (!local || local.readerId !== reader.readerId || local.pass !== reader.pass || local.passSetAt !== reader.passSetAt) await saveLocalReader(reader);
  await backfillPrivateNotes();
  return reader;
}

/** Replace the pass (e.g. it was shared by mistake). The note key stays the same, just re-wrapped. */
export async function rotatePass(): Promise<LocalReader> {
  const local = await getLocalReader();
  const noteKey = local?.noteKey ?? newNoteKey();
  const pass = await generatePass();
  const saved = await apiRequest<ReaderStatusDTO>("/api/reader/pass", { method: "PUT", body: { pass, wrappedKey: await wrapNoteKey(noteKey, pass), rotate: true } });
  const reader = { readerId: saved.readerId, pass, passSetAt: saved.passSetAt, noteKey };
  await saveLocalReader(reader);
  if (!local?.noteKey) await backfillPrivateNotes();
  return reader;
}

async function importChallenges(ids: string[]) {
  for (const id of ids) {
    const snapshot = await apiRequest<ChallengeSnapshot>(`/api/challenges/${id}/sync`);
    await applySnapshot(snapshot, { joinedNow: true });
  }
}

/** Continue as an existing reader on this device. Returns the challenges now available. */
export async function claimWithPass(input: string): Promise<string[]> {
  const pass = normalizePass(input);
  const res = await apiRequest<ClaimResultDTO>("/api/reader/claim", { method: "POST", body: { pass } });
  const previous = await getLocalReader();
  let noteKey = previous?.noteKey ?? null;
  if (res.wrappedKey) {
    try {
      noteKey = await unwrapNoteKey(res.wrappedKey, pass);
    } catch {
      // Key from a pass that was since changed: keep whatever this device had.
    }
  }
  if (previous?.noteKey && previous.noteKey !== noteKey) {
    // Notes this device sealed with its old key must be re-sealed with the reader's key.
    await getLocalDb().sessions.toCollection().modify({ privateSynced: false });
  }
  await saveLocalReader({ readerId: res.readerId, pass, passSetAt: res.passSetAt, noteKey });
  await getLocalDb().kv.put({ key: "pref:passPromptDone", value: true });
  await importChallenges(res.challengeIds);
  await backfillPrivateNotes();
  return res.challengeIds;
}

/** Redeem a host's one-time re-invite link (lost phone and pass). */
export async function claimWithReinvite(token: string): Promise<string[]> {
  const res = await apiRequest<ClaimResultDTO>("/api/reader/claim", { method: "POST", body: { reinvite: token } });
  await importChallenges(res.challengeIds);
  await ensureReadingPass();
  return res.challengeIds;
}

/**
 * Seal and upload private reflections that only exist on this device (written before the pass
 * existed, or offline). Runs after the note key is known.
 */
export async function backfillPrivateNotes() {
  const reader = await getLocalReader();
  if (!reader?.noteKey) return;
  const db = getLocalDb();
  const challenges = await db.challenges.toArray();
  const mine = new Set(challenges.map((c) => c.myParticipantId));
  const todo = await db.sessions
    .filter((s) => mine.has(s.participantId) && !s.deletedAt && !s.reflectionShared && Boolean(s.reflection) && s.privateSynced !== true)
    .toArray();
  if (!todo.length) return;
  const sealed = await Promise.all(todo.map(async (s) => ({ s, note: await sealNote(s.reflection!, reader.noteKey!) })));
  await db.transaction("rw", [db.sessions, db.syncQueue], async () => {
    for (const { s, note } of sealed) {
      const op: SyncOpRecord = {
        opId: newId("op"),
        challengeId: s.challengeId,
        type: "session.private",
        payload: { id: s.id, privateReflection: note },
        entityKind: "session",
        entityId: s.id,
        createdAt: new Date().toISOString(),
        attempts: 0,
        nextAttemptAt: 0,
        lastError: null,
        status: "pending",
      };
      await db.syncQueue.add(op);
      await db.sessions.update(s.id, { privateSynced: true });
    }
  });
  onLocalMutationNotify();
}
