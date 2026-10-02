import type { BookDTO, ChallengeSnapshot, EntityKind } from "@/lib/api-types";
import { goalFromPreset, pagesRead, type GoalPreset } from "@/lib/domain/goals";
import { joinedDateFor, participantDuration, todayInTimezone } from "@/lib/domain/dates";
import type { BookStatus, ReactionType, SessionUnit } from "@/lib/domain/types";
import { newId, reactionId, replyLikeId } from "@/lib/ids";
import type { CreateChallengeBody, JoinChallengeBody } from "@/lib/validation/api";
import type { SyncOpInput, SyncOpType } from "@/lib/validation/ops";
import { apiRequest } from "./api";
import { getLocalDb, type LocalBook, type LocalReply, type LocalSession, type SyncOpRecord } from "./db";
import { sealNote } from "./crypto";
import { applySnapshot, markEntitySynced } from "./merge";

type Listener = () => void;
const mutationListeners = new Set<Listener>();

/** The sync engine subscribes here to push shortly after local changes. */
export function onLocalMutation(fn: Listener): () => void {
  mutationListeners.add(fn);
  return () => mutationListeners.delete(fn);
}

/** Lets other local modules (e.g. the reader) trigger a sync after writing. */
export function onLocalMutationNotify() {
  notify();
}

function notify() {
  for (const fn of mutationListeners) fn();
}

const nowIso = () => new Date().toISOString();

function opRecord(challengeId: string, type: SyncOpType, payload: unknown, entityKind: EntityKind, entityId: string): SyncOpRecord {
  return {
    opId: newId("op"),
    challengeId,
    type,
    payload,
    entityKind,
    entityId,
    createdAt: nowIso(),
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    status: "pending",
  };
}

async function requireChallenge(challengeId: string) {
  const c = await getLocalDb().challenges.get(challengeId);
  if (!c) throw new Error("Challenge not found on this device");
  return c;
}

// ---------------------------------------------------------------------------
// Online-only: create & join (the server mints / validates the join code)
// ---------------------------------------------------------------------------

export interface ProfileInput {
  displayName: string;
  goal: GoalPreset;
  book?: { title: string; author?: string | null; totalPages?: number | null; coverUrl?: string | null } | null;
}

function bookPayload(book: NonNullable<ProfileInput["book"]>) {
  const t = nowIso();
  return {
    id: newId("bk"),
    title: book.title,
    author: book.author || null,
    coverUrl: book.coverUrl ?? null,
    totalPages: book.totalPages ?? null,
    currentPage: 0,
    status: "reading" as const,
    startedAt: t,
    completedAt: null,
    createdAt: t,
    updatedAt: t,
  };
}

function goalPayload(goal: GoalPreset) {
  const t = nowIso();
  return { id: newId("gl"), priority: "primary" as const, preset: goal, createdAt: t, updatedAt: t };
}

export async function createChallenge(input: {
  name: string;
  description: string;
  startDate: string;
  durationDays: number;
  timezone: string;
  host: ProfileInput;
}): Promise<ChallengeSnapshot> {
  const body: CreateChallengeBody = {
    opId: newId("op"),
    challenge: { name: input.name, description: input.description, startDate: input.startDate, durationDays: input.durationDays, timezone: input.timezone },
    host: { participantId: newId("pt"), displayName: input.host.displayName },
    goal: goalPayload(input.host.goal),
    book: input.host.book?.title ? bookPayload(input.host.book) : null,
  };
  const snapshot = await apiRequest<ChallengeSnapshot>("/api/challenges", { method: "POST", body });
  await applySnapshot(snapshot, { joinedNow: true });
  return snapshot;
}

export async function joinChallenge(code: string, profile: ProfileInput): Promise<ChallengeSnapshot> {
  const body: JoinChallengeBody = {
    opId: newId("op"),
    participantId: newId("pt"),
    displayName: profile.displayName,
    goal: goalPayload(profile.goal),
    book: profile.book?.title ? bookPayload(profile.book) : null,
  };
  const snapshot = await apiRequest<ChallengeSnapshot>(`/api/join/${encodeURIComponent(code)}`, { method: "POST", body });
  await applySnapshot(snapshot, { joinedNow: true });
  return snapshot;
}

// ---------------------------------------------------------------------------
// Local-first mutations: write IndexedDB + enqueue in one transaction
// ---------------------------------------------------------------------------

export interface LogReadingInput {
  challengeId: string;
  bookId: string | null;
  amount: number;
  unit: SessionUnit;
  /** Pages covered, for a minutes or chapters check-in. */
  pages?: number | null;
  reflection?: string;
  reflectionShared?: boolean;
  /** Defaults to today in the challenge timezone. */
  date?: string;
}

export async function logReading(input: LogReadingInput): Promise<LocalSession> {
  const db = getLocalDb();
  const challenge = await requireChallenge(input.challengeId);
  const t = nowIso();
  const reflection = input.reflection?.trim() || null;
  const shared = input.reflectionShared ?? true;
  // Private reflections travel end-to-end encrypted to the reader's other devices.
  const noteKey = !shared && reflection ? ((await db.kv.get("reader"))?.value as { noteKey?: string | null } | undefined)?.noteKey : null;
  const sealed = noteKey && reflection ? await sealNote(reflection, noteKey) : null;
  const session: LocalSession = {
    id: newId("rs"),
    challengeId: challenge.id,
    participantId: challenge.myParticipantId,
    bookId: input.bookId,
    date: input.date ?? todayInTimezone(challenge.timezone),
    amount: input.amount,
    unit: input.unit,
    pages: input.unit === "pages" ? null : (input.pages ?? null),
    reflection,
    reflectionShared: shared,
    privateReflection: sealed,
    privateSynced: Boolean(sealed),
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    syncStatus: "pending",
  };
  const payload = {
    id: session.id,
    bookId: session.bookId,
    date: session.date,
    amount: session.amount,
    unit: session.unit,
    pages: session.pages,
    reflection: shared ? reflection : null,
    privateReflection: sealed,
    createdAt: t,
  };

  await db.transaction("rw", [db.sessions, db.books, db.syncQueue], async () => {
    await db.sessions.add(session);
    await db.syncQueue.add(opRecord(challenge.id, "session.create", payload, "session", session.id));
    // Advance the book's current page by the pages read (for any unit).
    const read = pagesRead(session);
    if (session.bookId && read > 0) {
      const book = await db.books.get(session.bookId);
      if (book && !book.deletedAt) {
        const currentPage = Math.min(book.totalPages ?? Number.MAX_SAFE_INTEGER, book.currentPage + read);
        await saveBookInTx({ ...book, currentPage, status: book.status === "planned" ? "reading" : book.status });
      }
    }
  });
  notify();
  return session;
}

export async function deleteSession(sessionId: string) {
  const db = getLocalDb();
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  const t = nowIso();
  await db.transaction("rw", [db.sessions, db.syncQueue], async () => {
    await db.sessions.update(sessionId, { deletedAt: t, updatedAt: t, syncStatus: "pending" });
    await db.syncQueue.add(opRecord(session.challengeId, "session.delete", { id: sessionId, updatedAt: t }, "session", sessionId));
  });
  notify();
}

/** `withCover` false leaves the server's cover alone — it may have found one this device hasn't pulled yet. */
async function saveBookInTx(book: LocalBook, withCover = false) {
  const db = getLocalDb();
  const t = nowIso();
  const next: LocalBook = { ...book, updatedAt: t, syncStatus: "pending" };
  await db.books.put(next);
  const payload = {
    id: next.id,
    title: next.title,
    author: next.author,
    ...(withCover ? { coverUrl: next.coverUrl } : {}),
    totalPages: next.totalPages,
    currentPage: next.currentPage,
    status: next.status,
    startedAt: next.startedAt,
    completedAt: next.completedAt,
    createdAt: next.createdAt,
    updatedAt: t,
  };
  await db.syncQueue.add(opRecord(next.challengeId, "book.upsert", payload, "book", next.id));
  return next;
}

export async function addBook(
  challengeId: string,
  input: { title: string; author?: string | null; totalPages?: number | null; coverUrl?: string | null; status?: BookStatus },
) {
  const db = getLocalDb();
  const challenge = await requireChallenge(challengeId);
  const t = nowIso();
  const status = input.status ?? "reading";
  const book: LocalBook = {
    id: newId("bk"),
    challengeId,
    participantId: challenge.myParticipantId,
    title: input.title.trim(),
    author: input.author?.trim() || null,
    coverUrl: input.coverUrl ?? null,
    totalPages: input.totalPages ?? null,
    currentPage: 0,
    status,
    startedAt: status === "reading" ? t : null,
    completedAt: null,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    syncStatus: "pending",
  };
  const saved = await db.transaction("rw", [db.books, db.syncQueue], () => saveBookInTx(book, true));
  notify();
  return saved;
}

export async function updateBook(bookId: string, patch: Partial<Pick<BookDTO, "title" | "author" | "coverUrl" | "totalPages" | "currentPage" | "status">>) {
  const db = getLocalDb();
  const book = await db.books.get(bookId);
  if (!book) return;
  const t = nowIso();
  const next: LocalBook = { ...book, ...patch };
  if (patch.status === "completed" && !book.completedAt) {
    next.completedAt = t;
    if (next.totalPages) next.currentPage = next.totalPages;
  }
  if (patch.status && patch.status !== "completed") next.completedAt = null;
  if (patch.status === "reading" && !book.startedAt) next.startedAt = t;
  if (next.totalPages && next.currentPage > next.totalPages) next.currentPage = next.totalPages;
  const coverChanged = "coverUrl" in patch && patch.coverUrl !== book.coverUrl;
  await db.transaction("rw", [db.books, db.syncQueue], () => saveBookInTx(next, coverChanged));
  notify();
}

export async function removeBook(bookId: string) {
  const db = getLocalDb();
  const book = await db.books.get(bookId);
  if (!book) return;
  const t = nowIso();
  await db.transaction("rw", [db.books, db.syncQueue], async () => {
    await db.books.update(bookId, { deletedAt: t, updatedAt: t, syncStatus: "pending" });
    await db.syncQueue.add(opRecord(book.challengeId, "book.delete", { id: bookId, updatedAt: t }, "book", bookId));
  });
  notify();
}

export async function setGoal(challengeId: string, preset: GoalPreset) {
  const db = getLocalDb();
  const challenge = await requireChallenge(challengeId);
  const t = nowIso();
  const me = await db.participants.get(challenge.myParticipantId);
  const duration = me ? participantDuration(challenge, joinedDateFor(challenge, me)) : challenge.durationDays;
  await db.transaction("rw", [db.goals, db.syncQueue], async () => {
    const existing = await db.goals
      .where("participantId")
      .equals(challenge.myParticipantId)
      .filter((g) => g.priority === "primary")
      .first();
    const id = existing?.id ?? newId("gl");
    const createdAt = existing?.createdAt ?? t;
    await db.goals.put({
      id,
      challengeId,
      participantId: challenge.myParticipantId,
      priority: "primary",
      ...goalFromPreset(preset, duration),
      createdAt,
      updatedAt: t,
      deletedAt: null,
      syncStatus: "pending",
    });
    await db.syncQueue.add(opRecord(challengeId, "goal.upsert", { id, priority: "primary", preset, createdAt, updatedAt: t }, "goal", id));
  });
  notify();
}

export async function updateDisplayName(challengeId: string, displayName: string) {
  const db = getLocalDb();
  const challenge = await requireChallenge(challengeId);
  const t = nowIso();
  await db.transaction("rw", [db.participants, db.syncQueue], async () => {
    await db.participants.update(challenge.myParticipantId, { displayName, updatedAt: t, syncStatus: "pending" });
    await db.syncQueue.add(opRecord(challengeId, "participant.update", { displayName, updatedAt: t }, "participant", challenge.myParticipantId));
  });
  notify();
}

export async function setReaction(challengeId: string, sessionId: string, type: ReactionType, active: boolean) {
  const db = getLocalDb();
  const challenge = await requireChallenge(challengeId);
  const t = nowIso();
  const id = reactionId(sessionId, challenge.myParticipantId, type);
  await db.transaction("rw", [db.reactions, db.syncQueue], async () => {
    const existing = await db.reactions.get(id);
    await db.reactions.put({
      id,
      challengeId,
      participantId: challenge.myParticipantId,
      sessionId,
      type,
      createdAt: existing?.createdAt ?? t,
      updatedAt: t,
      deletedAt: active ? null : t,
      syncStatus: "pending",
    });
    await db.syncQueue.add(opRecord(challengeId, "reaction.set", { id, sessionId, type, active, updatedAt: t }, "reaction", id));
  });
  notify();
}

async function enqueueOnly(challengeId: string, type: SyncOpType, payload: unknown, kind: EntityKind, entityId: string) {
  const db = getLocalDb();
  await db.syncQueue.add(opRecord(challengeId, type, payload, kind, entityId));
  notify();
}

export async function updateChallengeDetails(challengeId: string, name: string, description: string) {
  const db = getLocalDb();
  const t = nowIso();
  await db.challenges.update(challengeId, { name, description, updatedAt: t });
  await enqueueOnly(challengeId, "challenge.update", { name, description, updatedAt: t }, "challenge", challengeId);
}

export async function archiveChallenge(challengeId: string) {
  await getLocalDb().challenges.update(challengeId, { status: "archived" });
  await enqueueOnly(challengeId, "challenge.archive", {}, "challenge", challengeId);
}

export async function removeParticipant(challengeId: string, participantId: string) {
  await getLocalDb().participants.update(participantId, { status: "removed", syncStatus: "pending" });
  await enqueueOnly(challengeId, "participant.remove", { participantId }, "participant", participantId);
}

/** Host: fold a member who joined twice into the copy being kept. The server moves their reading over. */
export async function mergeParticipants(challengeId: string, fromId: string, intoId: string) {
  await getLocalDb().participants.update(fromId, { status: "removed", syncStatus: "pending" });
  await enqueueOnly(challengeId, "participant.merge", { fromId, intoId }, "participant", fromId);
}

export async function leaveChallenge(challengeId: string) {
  const db = getLocalDb();
  const challenge = await requireChallenge(challengeId);
  await db.participants.update(challenge.myParticipantId, { status: "left", syncStatus: "pending" });
  await db.challenges.update(challengeId, { access: "left" });
  await enqueueOnly(challengeId, "participant.leave", {}, "participant", challenge.myParticipantId);
}

/** Move failed ops back to pending (e.g. after the user taps "Try again"). */
export async function retryFailed() {
  const db = getLocalDb();
  await db.syncQueue.where("status").equals("failed").modify({ status: "pending", nextAttemptAt: 0 });
  notify();
}

/** Drop a failed op. A never-synced check-in is removed; anything else is restored from the server. */
export async function discardFailed(opId: string) {
  const db = getLocalDb();
  const op = await db.syncQueue.get(opId);
  if (!op) return;
  await db.transaction("rw", [db.syncQueue, db.sessions, db.challenges], async () => {
    await db.syncQueue.delete(opId);
    if (op.type === "session.create") await db.sessions.delete(op.entityId);
    await db.challenges.update(op.challengeId, { cursor: null });
  });
  if (op.type !== "session.create") await markEntitySynced(op.entityKind, op.entityId);
  notify();
}

export type { SyncOpInput };

export async function addReply(challengeId: string, sessionId: string, body: string, parentId: string | null = null): Promise<LocalReply | null> {
  const text = body.trim();
  if (!text) return null;
  const db = getLocalDb();
  const challenge = await requireChallenge(challengeId);
  const t = nowIso();
  const reply: LocalReply = {
    id: newId("rp"),
    challengeId,
    participantId: challenge.myParticipantId,
    sessionId,
    parentId,
    body: text.slice(0, 500),
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    syncStatus: "pending",
  };
  await db.transaction("rw", [db.replies, db.syncQueue], async () => {
    await db.replies.add(reply);
    await db.syncQueue.add(opRecord(challengeId, "reply.create", { id: reply.id, sessionId, parentId, body: reply.body, createdAt: t }, "reply", reply.id));
  });
  notify();
  return reply;
}

export async function deleteReply(replyId: string) {
  const db = getLocalDb();
  const reply = await db.replies.get(replyId);
  if (!reply) return;
  const t = nowIso();
  await db.transaction("rw", [db.replies, db.syncQueue], async () => {
    await db.replies.update(replyId, { deletedAt: t, updatedAt: t, syncStatus: "pending" });
    await db.syncQueue.add(opRecord(reply.challengeId, "reply.delete", { id: replyId, updatedAt: t }, "reply", replyId));
  });
  notify();
}

export async function setReplyLike(challengeId: string, replyId: string, active: boolean) {
  const db = getLocalDb();
  const challenge = await requireChallenge(challengeId);
  const t = nowIso();
  const id = replyLikeId(replyId, challenge.myParticipantId);
  await db.transaction("rw", [db.replyLikes, db.syncQueue], async () => {
    const existing = await db.replyLikes.get(id);
    await db.replyLikes.put({
      id,
      challengeId,
      participantId: challenge.myParticipantId,
      replyId,
      createdAt: existing?.createdAt ?? t,
      updatedAt: t,
      deletedAt: active ? null : t,
      syncStatus: "pending",
    });
    await db.syncQueue.add(opRecord(challengeId, "reply.like", { id, replyId, active, updatedAt: t }, "replyLike", id));
  });
  notify();
}
