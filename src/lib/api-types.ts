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
  reflection: string | null;
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
}

export interface JoinPreview {
  challenge: Pick<ChallengeDTO, "id" | "name" | "description" | "startDate" | "endDate" | "durationDays" | "timezone" | "status">;
  hostName: string | null;
  participantCount: number;
  phase: "upcoming" | "active" | "ended" | "archived";
  membership: { participantId: string; status: ParticipantDTO["status"] } | null;
}

export type EntityKind = "participant" | "goal" | "book" | "session" | "reaction" | "challenge";

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

export const DEVICE_HEADER = "x-stillreading-device";
export const SECRET_HEADER = "x-stillreading-secret";
