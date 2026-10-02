import { z } from "zod";
import {
  amount,
  bookAuthor,
  bookStatus,
  bookTitle,
  challengeName,
  coverUrl,
  dateKey,
  description,
  displayName,
  id,
  isoTimestamp,
  pageCount,
  reactionType,
  reflection,
  replyBody,
  sessionUnit,
} from "./fields";
import { goalPreset } from "./goal";
import { SEALED_NOTE_PATTERN } from "@/lib/pass";

const sealedNote = z.string().max(4100).regex(SEALED_NOTE_PATTERN, "Invalid encrypted note");

const reactionIdPattern = /^rx_[0-9A-Z]{26}\.[0-9A-Z]{26}\.(heart|fire|clap|laugh|book)$/;

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

export const sessionFields = z
  .object({
    id: id("rs"),
    bookId: id("bk").nullable().optional(),
    date: dateKey,
    amount,
    unit: sessionUnit,
    /** Pages covered during a minutes or chapters check-in. Optional so older clients' queued ops still sync. */
    pages: amount.nullable().optional(),
    reflection: reflection.nullable().optional(),
    privateReflection: sealedNote.nullable().optional(),
    createdAt: isoTimestamp,
  })
  .refine((s) => s.unit !== "pages" || s.pages == null, { message: "Pages check-ins record pages as the amount", path: ["pages"] });

const envelope = { opId: id("op"), challengeId: id("ch") };

export const syncOp = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.literal("participant.update"), payload: z.object({ displayName, updatedAt: isoTimestamp }) }),
  z.object({ ...envelope, type: z.literal("participant.leave"), payload: z.object({}).default({}) }),
  z.object({ ...envelope, type: z.literal("goal.upsert"), payload: goalFields }),
  z.object({ ...envelope, type: z.literal("book.upsert"), payload: bookFields }),
  z.object({ ...envelope, type: z.literal("book.delete"), payload: z.object({ id: id("bk"), updatedAt: isoTimestamp }) }),
  z.object({ ...envelope, type: z.literal("session.create"), payload: sessionFields }),
  z.object({ ...envelope, type: z.literal("session.private"), payload: z.object({ id: id("rs"), privateReflection: sealedNote.nullable() }) }),
  z.object({ ...envelope, type: z.literal("session.delete"), payload: z.object({ id: id("rs"), updatedAt: isoTimestamp }) }),
  z.object({
    ...envelope,
    type: z.literal("reply.create"),
    payload: z.object({ id: id("rp"), sessionId: id("rs"), parentId: id("rp").nullable().optional(), body: replyBody, createdAt: isoTimestamp }),
  }),
  z.object({ ...envelope, type: z.literal("reply.delete"), payload: z.object({ id: id("rp"), updatedAt: isoTimestamp }) }),
  z.object({
    ...envelope,
    type: z.literal("reply.like"),
    payload: z.object({ id: z.string().regex(/^rl_[0-9A-Z]{26}\.[0-9A-Z]{26}$/), replyId: id("rp"), active: z.boolean(), updatedAt: isoTimestamp }),
  }),
  z.object({
    ...envelope,
    type: z.literal("reaction.set"),
    payload: z.object({ id: z.string().regex(reactionIdPattern), sessionId: id("rs"), type: reactionType, active: z.boolean(), updatedAt: isoTimestamp }),
  }),
  z.object({ ...envelope, type: z.literal("challenge.update"), payload: z.object({ name: challengeName, description, updatedAt: isoTimestamp }) }),
  z.object({ ...envelope, type: z.literal("challenge.archive"), payload: z.object({}).default({}) }),
  z.object({ ...envelope, type: z.literal("participant.remove"), payload: z.object({ participantId: id("pt") }) }),
  z.object({ ...envelope, type: z.literal("participant.merge"), payload: z.object({ fromId: id("pt"), intoId: id("pt") }) }),
]);

export type SyncOp = z.output<typeof syncOp>;
export type SyncOpInput = z.input<typeof syncOp>;
export type SyncOpType = SyncOp["type"];

export const MAX_OPS_PER_PUSH = 50;

/** The envelope is validated strictly; each op separately so one bad op does not sink the batch. */
export const syncPushBody = z.object({
  ops: z.array(z.object({ opId: id("op") }).passthrough()).min(1).max(MAX_OPS_PER_PUSH),
});
