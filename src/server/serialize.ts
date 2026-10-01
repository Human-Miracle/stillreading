import type { BookDTO, ChallengeDTO, GoalDTO, ParticipantDTO, ReactionDTO, SessionDTO } from "@/lib/api-types";
import type { BookRow, ChallengeRow, GoalRow, ParticipantRow, ReactionRow, SessionRow } from "@/db/schema";

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

export function challengeDTO(r: ChallengeRow): ChallengeDTO {
  return {
    id: r.id,
    joinCode: r.publicJoinCode,
    name: r.name,
    description: r.description,
    startDate: r.startDate,
    endDate: r.endDate,
    durationDays: r.durationDays,
    timezone: r.timezone,
    status: r.status,
    hostParticipantId: r.hostParticipantId,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

/** Never exposes device_id. */
export function participantDTO(r: ParticipantRow): ParticipantDTO {
  return {
    id: r.id,
    challengeId: r.challengeId,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    role: r.role,
    status: r.status,
    joinedAt: iso(r.joinedAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

export function goalDTO(r: GoalRow): GoalDTO {
  return {
    id: r.id,
    challengeId: r.challengeId,
    participantId: r.participantId,
    priority: r.priority,
    goalType: r.goalType,
    targetUnit: r.targetUnit,
    targetValue: r.targetValue,
    frequency: r.frequency,
    totalTarget: r.totalTarget,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
  };
}

export function bookDTO(r: BookRow): BookDTO {
  return {
    id: r.id,
    challengeId: r.challengeId,
    participantId: r.participantId,
    title: r.title,
    author: r.author,
    coverUrl: r.coverUrl,
    totalPages: r.totalPages,
    currentPage: r.currentPage,
    status: r.status,
    startedAt: isoOrNull(r.startedAt),
    completedAt: isoOrNull(r.completedAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
  };
}

export function sessionDTO(r: SessionRow): SessionDTO {
  return {
    id: r.id,
    challengeId: r.challengeId,
    participantId: r.participantId,
    bookId: r.bookId,
    date: r.date,
    amount: r.amount,
    unit: r.unit,
    reflection: r.reflection,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
  };
}

export function reactionDTO(r: ReactionRow): ReactionDTO {
  return {
    id: r.id,
    challengeId: r.challengeId,
    participantId: r.participantId,
    sessionId: r.readingSessionId,
    type: r.type,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    deletedAt: isoOrNull(r.deletedAt),
  };
}
