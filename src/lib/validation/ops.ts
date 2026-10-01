import { z } from "zod";
import {
  amount,
  bookAuthor,
  bookStatus,
  bookTitle,
  coverUrl,
  challengeName,
  dateKey,
  description,
  displayName,
  id,
  isoTimestamp,
  pageCount,
  reactionType,
  reflection,
  sessionUnit,
} from "./fields";
import { goalPreset } from "./goal";

const reactionIdPattern = /^rx_[0-9A-Z]{26}\.[0-9A-Z]{26}\.(heart|fire|clap|book)$/;

export const bookFields = z.object({
  id: id("bk"),
  title: bookTitle,
  author: bookAuthor.nullable().optional(),
  /** Omitted by older clients: the server then keeps the stored cover. */
  coverUrl: coverUrl.nullable().optional(),
  totalPages: pageCount.nullable().optional(),
  currentPage: z.number().int().min(0).max(20_000).default(0),
  status: bookStatus,
  startedAt: isoTimestamp.nullable().optional(),
  completedAt: isoTimestamp.nullable().optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const goalFields = z.object({
  id: id("gl"),
  priority: z.enum(["primary", "secondary"]).default("primary"),
  preset: goalPreset,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const sessionFields = z.object({
  id: id("rs"),
  bookId: id("bk").nullable().optional(),
  date: dateKey,
  amount,
  unit: sessionUnit,
  reflection: reflection.nullable().optional(),
  createdAt: isoTimestamp,
});

const envelope = { opId: id("op"), challengeId: id("ch") };

export const syncOp = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.literal("participant.update"), payload: z.object({ displayName, updatedAt: isoTimestamp }) }),
  z.object({ ...envelope, type: z.literal("participant.leave"), payload: z.object({}).default({}) }),
  z.object({ ...envelope, type: z.literal("goal.upsert"), payload: goalFields }),
  z.object({ ...envelope, type: z.literal("book.upsert"), payload: bookFields }),
  z.object({ ...envelope, type: z.literal("book.delete"), payload: z.object({ id: id("bk"), updatedAt: isoTimestamp }) }),
  z.object({ ...envelope, type: z.literal("session.create"), payload: sessionFields }),
  z.object({ ...envelope, type: z.literal("session.delete"), payload: z.object({ id: id("rs"), updatedAt: isoTimestamp }) }),
  z.object({
    ...envelope,
    type: z.literal("reaction.set"),
    payload: z.object({ id: z.string().regex(reactionIdPattern), sessionId: id("rs"), type: reactionType, active: z.boolean(), updatedAt: isoTimestamp }),
  }),
  z.object({ ...envelope, type: z.literal("challenge.update"), payload: z.object({ name: challengeName, description, updatedAt: isoTimestamp }) }),
  z.object({ ...envelope, type: z.literal("challenge.archive"), payload: z.object({}).default({}) }),
  z.object({ ...envelope, type: z.literal("participant.remove"), payload: z.object({ participantId: id("pt") }) }),
]);

export type SyncOp = z.output<typeof syncOp>;
export type SyncOpInput = z.input<typeof syncOp>;
export type SyncOpType = SyncOp["type"];

export const MAX_OPS_PER_PUSH = 50;

/** The envelope is validated strictly; each op separately so one bad op does not sink the batch. */
export const syncPushBody = z.object({
  ops: z.array(z.object({ opId: id("op") }).passthrough()).min(1).max(MAX_OPS_PER_PUSH),
});
