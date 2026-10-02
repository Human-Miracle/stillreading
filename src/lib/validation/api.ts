import { z } from "zod";
import { bookFields, goalFields } from "./ops";
import { challengeName, dateKey, description, displayName, id, timezone } from "./fields";

export const DURATION_OPTIONS = [7, 14, 30] as const;

export const createChallengeBody = z.object({
  opId: id("op"),
  challenge: z.object({
    name: challengeName,
    description: description.default(""),
    startDate: dateKey,
    durationDays: z.number().int().min(1).max(365),
    timezone,
  }),
  host: z.object({ participantId: id("pt"), displayName }),
  goal: goalFields,
  book: bookFields.nullable().optional(),
});
export type CreateChallengeBody = z.input<typeof createChallengeBody>;

export const joinChallengeBody = z.object({
  opId: id("op"),
  participantId: id("pt"),
  displayName,
  goal: goalFields,
  book: bookFields.nullable().optional(),
});
export type JoinChallengeBody = z.input<typeof joinChallengeBody>;

export const productEventBody = z.object({
  name: z.enum([
    "challenge_created",
    "challenge_joined",
    "goal_selected",
    "book_added",
    "reading_logged",
    "reading_goal_completed",
    "streak_started",
    "streak_broken",
    "reaction_added",
    "reply_added",
    "challenge_viewed",
    "invite_link_copied",
    "install_prompt_shown",
    "pwa_installed",
    "challenge_completed",
    "completion_shared",
    "handoff_copied",
    "handoff_pasted",
    "handoff_completed",
  ]),
  challengeId: id("ch").optional(),
  props: z.record(z.string().max(40), z.union([z.string().max(80), z.number(), z.boolean()])).optional(),
});
export type ProductEventName = z.infer<typeof productEventBody>["name"];
