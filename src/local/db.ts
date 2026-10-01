import Dexie, { type EntityTable } from "dexie";
import type { BookDTO, ChallengeDTO, EntityKind, GoalDTO, ParticipantDTO, ReactionDTO, SessionDTO } from "@/lib/api-types";
import type { SyncOpType } from "@/lib/validation/ops";

export type SyncStatus = "pending" | "synced" | "failed";
export type ChallengeAccess = "ok" | "removed" | "left" | "gone";

export interface LocalChallenge extends ChallengeDTO {
  myParticipantId: string;
  /** Server cursor for incremental pulls. */
  cursor: string | null;
  access: ChallengeAccess;
  lastPulledAt: string | null;
  joinedLocallyAt: string;
}

export type LocalParticipant = ParticipantDTO & { syncStatus: SyncStatus };
export type LocalGoal = GoalDTO & { syncStatus: SyncStatus };
export type LocalBook = BookDTO & { syncStatus: SyncStatus };
export type LocalSession = SessionDTO & {
  syncStatus: SyncStatus;
  /** Private reflections are kept on this device only and never sent to the server. */
  reflectionShared: boolean;
};
export type LocalReaction = ReactionDTO & { syncStatus: SyncStatus };

export interface SyncOpRecord {
  opId: string;
  challengeId: string;
  type: SyncOpType;
  payload: unknown;
  entityKind: EntityKind;
  entityId: string;
  createdAt: string;
  attempts: number;
  /** epoch ms */
  nextAttemptAt: number;
  lastError: string | null;
  status: "pending" | "failed";
}

export interface KvRecord {
  key: string;
  value: unknown;
}

export class Read30DB extends Dexie {
  kv!: EntityTable<KvRecord, "key">;
  challenges!: EntityTable<LocalChallenge, "id">;
  participants!: EntityTable<LocalParticipant, "id">;
  goals!: EntityTable<LocalGoal, "id">;
  books!: EntityTable<LocalBook, "id">;
  sessions!: EntityTable<LocalSession, "id">;
  reactions!: EntityTable<LocalReaction, "id">;
  syncQueue!: EntityTable<SyncOpRecord, "opId">;

  constructor(name = "read30") {
    super(name);
    this.version(1).stores({
      kv: "key",
      challenges: "id, joinCode",
      participants: "id, challengeId",
      goals: "id, challengeId, participantId",
      books: "id, challengeId, participantId",
      sessions: "id, challengeId, participantId, [challengeId+date], createdAt",
      reactions: "id, challengeId, sessionId",
      syncQueue: "opId, createdAt, challengeId, status, entityId",
    });
  }
}

let instance: Read30DB | null = null;

export function getLocalDb(): Read30DB {
  if (!instance) instance = new Read30DB();
  return instance;
}

/** Test hook. */
export function setLocalDb(db: Read30DB | null) {
  instance = db;
}
