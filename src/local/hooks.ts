"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { joinedDateFor, todayInTimezone } from "@/lib/domain/dates";
import { isLive } from "@/lib/domain/goals";
import { participantProgress, type ParticipantProgress } from "@/lib/domain/progress";
import { leaderboard, type LeaderboardEntry } from "@/lib/domain/leaderboard";
import { groupStats, type GroupStats } from "@/lib/domain/stats";
import { getLocalDb, type LocalBook, type LocalChallenge, type LocalGoal, type LocalParticipant, type LocalReaction, type LocalReply, type LocalReplyLike, type LocalSession } from "./db";
import { getSyncEngine, type SyncState } from "./sync/engine";

/** Re-render periodically so "today" rolls over at midnight in the challenge timezone. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useChallenges(): LocalChallenge[] | undefined {
  return useLiveQuery(() => getLocalDb().challenges.toArray(), []);
}

export interface ChallengeData {
  challenge: LocalChallenge | null;
  participants: LocalParticipant[];
  goals: LocalGoal[];
  books: LocalBook[];
  sessions: LocalSession[];
  reactions: LocalReaction[];
  replies: LocalReply[];
  replyLikes: LocalReplyLike[];
}

export function useChallengeData(challengeId: string): ChallengeData | undefined {
  return useLiveQuery(async () => {
    const db = getLocalDb();
    const [challenge, participants, goals, books, sessions, reactions, replies, replyLikes] = await Promise.all([
      db.challenges.get(challengeId),
      db.participants.where("challengeId").equals(challengeId).toArray(),
      db.goals.where("challengeId").equals(challengeId).toArray(),
      db.books.where("challengeId").equals(challengeId).toArray(),
      db.sessions.where("challengeId").equals(challengeId).toArray(),
      db.reactions.where("challengeId").equals(challengeId).toArray(),
      db.replies.where("challengeId").equals(challengeId).toArray(),
      db.replyLikes.where("challengeId").equals(challengeId).toArray(),
    ]);
    return { challenge: challenge ?? null, participants, goals, books, sessions, reactions, replies, replyLikes };
  }, [challengeId]);
}

export interface MemberView {
  participant: LocalParticipant;
  goal: LocalGoal | null;
  books: LocalBook[];
  currentBook: LocalBook | null;
  progress: ParticipantProgress;
  sessions: LocalSession[];
}

export interface ChallengeView {
  challenge: LocalChallenge;
  today: string;
  me: MemberView | null;
  isHost: boolean;
  members: MemberView[];
  stats: GroupStats;
  /** Readers ranked by XP: pages read, plus small add-ons (see domain/leaderboard). */
  leaderboard: LeaderboardEntry[];
  /** Live sessions from active members, newest first. */
  feed: LocalSession[];
  participantsById: Map<string, LocalParticipant>;
  booksById: Map<string, LocalBook>;
  reactionsBySession: Map<string, LocalReaction[]>;
  /** Live replies from active members, oldest first. */
  repliesBySession: Map<string, LocalReply[]>;
  /** Live likes from active members, per reply. */
  likesByReply: Map<string, LocalReplyLike[]>;
}

function pickCurrentBook(books: LocalBook[], sessions: LocalSession[]): LocalBook | null {
  const reading = books.filter((b) => b.status === "reading").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (reading[0]) return reading[0];
  const lastWithBook = [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((s) => s.bookId);
  return books.find((b) => b.id === lastWithBook?.bookId) ?? books[0] ?? null;
}

export function buildChallengeView(data: ChallengeData, now: Date): ChallengeView | null {
  const { challenge } = data;
  if (!challenge) return null;
  const today = todayInTimezone(challenge.timezone, now);
  const active = data.participants.filter((p) => p.status === "active");
  const activeIds = new Set(active.map((p) => p.id));

  const liveSessions = data.sessions.filter(isLive);
  const sessionsBy = new Map<string, LocalSession[]>();
  for (const s of liveSessions) {
    const list = sessionsBy.get(s.participantId);
    if (list) list.push(s);
    else sessionsBy.set(s.participantId, [s]);
  }
  const liveBooks = data.books.filter(isLive);

  const members: MemberView[] = active.map((participant) => {
    const goal =
      data.goals.find((g) => g.participantId === participant.id && g.priority === "primary" && !g.deletedAt) ?? null;
    const books = liveBooks.filter((b) => b.participantId === participant.id);
    const sessions = sessionsBy.get(participant.id) ?? [];
    return {
      participant,
      goal,
      books,
      currentBook: pickCurrentBook(books, sessions),
      sessions,
      progress: participantProgress({ challenge, goal, sessions, books, today, joinedDate: joinedDateFor(challenge, participant) }),
    };
  });

  const reactionsBySession = new Map<string, LocalReaction[]>();
  for (const r of data.reactions) {
    if (r.deletedAt || !activeIds.has(r.participantId)) continue;
    const list = reactionsBySession.get(r.sessionId);
    if (list) list.push(r);
    else reactionsBySession.set(r.sessionId, [r]);
  }

  const repliesBySession = new Map<string, LocalReply[]>();
  for (const r of [...data.replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (r.deletedAt || !activeIds.has(r.participantId)) continue;
    const list = repliesBySession.get(r.sessionId);
    if (list) list.push(r);
    else repliesBySession.set(r.sessionId, [r]);
  }

  const likesByReply = new Map<string, LocalReplyLike[]>();
  for (const l of data.replyLikes) {
    if (l.deletedAt || !activeIds.has(l.participantId)) continue;
    const list = likesByReply.get(l.replyId);
    if (list) list.push(l);
    else likesByReply.set(l.replyId, [l]);
  }

  const me = members.find((m) => m.participant.id === challenge.myParticipantId) ?? null;
  const statsRows = members.map((m) => ({ participantId: m.participant.id, displayName: m.participant.displayName, progress: m.progress }));
  return {
    challenge,
    today,
    me,
    isHost: challenge.hostParticipantId === challenge.myParticipantId,
    members,
    stats: groupStats(statsRows),
    leaderboard: leaderboard(statsRows),
    feed: liveSessions.filter((s) => activeIds.has(s.participantId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    participantsById: new Map(data.participants.map((p) => [p.id, p])),
    booksById: new Map(data.books.map((b) => [b.id, b])),
    reactionsBySession,
    repliesBySession,
    likesByReply,
  };
}

/** undefined = loading, null = not on this device. */
export function useChallengeView(challengeId: string): ChallengeView | null | undefined {
  const data = useChallengeData(challengeId);
  const now = useNow();
  return useMemo(() => (data ? buildChallengeView(data, now) : undefined), [data, now]);
}

export function useSyncState(): SyncState {
  const engine = getSyncEngine();
  return useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
}

export function useFailedOps() {
  return useLiveQuery(() => getLocalDb().syncQueue.where("status").equals("failed").toArray(), []) ?? [];
}
