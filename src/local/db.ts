import Dexie, { type EntityTable } from "dexie";
import type { BookDTO, ChallengeDTO, EntityKind, GoalDTO, ParticipantDTO, ReactionDTO, ReplyDTO, ReplyLikeDTO, SessionDTO } from "@/lib/api-types";
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
  /** Private reflection sealed and uploaded for this reader's other devices. */
  privateSynced?: boolean;
};
export type LocalReaction = ReactionDTO & { syncStatus: SyncStatus };
export type LocalReply = ReplyDTO & { syncStatus: SyncStatus };
export type LocalReplyLike = ReplyLikeDTO & { syncStatus: SyncStatus };

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

export class StillReadingDB extends Dexie {
  kv!: EntityTable<KvRecord, "key">;
  challenges!: EntityTable<LocalChallenge, "id">;
  participants!: EntityTable<LocalParticipant, "id">;
  goals!: EntityTable<LocalGoal, "id">;
  books!: EntityTable<LocalBook, "id">;
  sessions!: EntityTable<LocalSession, "id">;
  reactions!: EntityTable<LocalReaction, "id">;
  replies!: EntityTable<LocalReply, "id">;
  replyLikes!: EntityTable<LocalReplyLike, "id">;
  syncQueue!: EntityTable<SyncOpRecord, "opId">;

  // Storage name predates the rename to Still Reading; kept so existing devices keep their data.
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
    // v2: replies on check-ins.
    this.version(2).stores({ replies: "id, challengeId, sessionId" });
    // v3: likes on replies.
    this.version(3).stores({ replyLikes: "id, challengeId, replyId" });
  }
}

let instance: StillReadingDB | null = null;

export function getLocalDb(): StillReadingDB {
  if (!instance) instance = new StillReadingDB();
  return instance;
}

/**
 * Whether this browser lets the app keep its data. In-app browsers (Instagram, WhatsApp…) and some
 * private modes block IndexedDB, or leave it hanging; without it nothing can be saved, so joining
 * explains that instead of failing silently.
 */
export async function localStorageWorks(timeoutMs = 4000): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    return await Promise.race([
      getLocalDb()
        .kv.get("storage-check")
        .then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
  } catch {
    return false;
  }
}

/** Test hook. */
export function setLocalDb(db: StillReadingDB | null) {
  instance = db;
}
