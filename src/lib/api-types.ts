import type {
  BookStatus,
  DateKey,
  GoalFrequency,
  GoalPriority,
  GoalType,
  GoalUnit,
  ReactionType,
  SessionUnit,
} from "@/lib/domain/types";

/** Wire format shared by API responses and the local (Dexie) store. Timestamps are ISO strings. */
export interface ChallengeDTO {
  id: string;
  joinCode: string;
  name: string;
  description: string;
  startDate: DateKey;
  endDate: DateKey;
  durationDays: number;
  timezone: string;
  status: "draft" | "active" | "completed" | "archived";
  hostParticipantId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantDTO {
  id: string;
  challengeId: string;
  displayName: string;
  avatarUrl: string | null;
  role: "host" | "participant";
  status: "active" | "removed" | "left";
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoalDTO {
  id: string;
  challengeId: string;
  participantId: string;
  priority: GoalPriority;
  goalType: GoalType;
  targetUnit: GoalUnit;
  targetValue: number;
  frequency: GoalFrequency;
  totalTarget: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BookDTO {
  id: string;
  challengeId: string;
  participantId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  totalPages: number | null;
  currentPage: number;
  status: BookStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SessionDTO {
  id: string;
  challengeId: string;
  participantId: string;
  bookId: string | null;
  date: DateKey;
  amount: number;
  unit: SessionUnit;
  /** Pages covered during a minutes or chapters check-in; null for pages check-ins and older rows. */
  pages: number | null;
  reflection: string | null;
  /** End-to-end encrypted private reflection; only present for the viewer's own sessions. */
  privateReflection: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ReactionDTO {
  id: string;
  challengeId: string;
  participantId: string;
  sessionId: string;
  type: ReactionType;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ReplyDTO {
  id: string;
  challengeId: string;
  participantId: string;
  sessionId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ChallengeSnapshot {
  cursor: string;
  full: boolean;
  me: { participantId: string };
  challenge: ChallengeDTO;
  participants: ParticipantDTO[];
  goals: GoalDTO[];
  books: BookDTO[];
  sessions: SessionDTO[];
  reactions: ReactionDTO[];
  replies: ReplyDTO[];
}

export interface JoinPreview {
  challenge: Pick<ChallengeDTO, "id" | "name" | "description" | "startDate" | "endDate" | "durationDays" | "timezone" | "status">;
  hostName: string | null;
  participantCount: number;
  phase: "upcoming" | "active" | "ended" | "archived";
  membership: { participantId: string; status: ParticipantDTO["status"] } | null;
}

export type EntityKind = "participant" | "goal" | "book" | "session" | "reaction" | "reply" | "challenge";

export type PushStatus = "ok" | "duplicate" | "stale" | "rejected" | "error";

export interface PushResult {
  opId: string;
  status: PushStatus;
  code?: string;
  message?: string;
  entity?: { kind: EntityKind; record: unknown };
}

export interface ApiErrorBody {
  error: { code: string; message: string; issues?: unknown };
}

export interface ReaderStatusDTO {
  readerId: string;
  hasPass: boolean;
  passSetAt: string | null;
  wrappedKey: string | null;
}

export interface ClaimResultDTO extends ReaderStatusDTO {
  challengeIds: string[];
}

export const DEVICE_HEADER = "x-stillreading-device";
export const SECRET_HEADER = "x-stillreading-secret";
