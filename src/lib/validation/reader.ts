import { z } from "zod";
import { WRAPPED_KEY_PATTERN } from "@/lib/pass";
import { id } from "./fields";

export const setPassBody = z.object({
  pass: z.string().min(10).max(80),
  wrappedKey: z.string().max(400).regex(WRAPPED_KEY_PATTERN, "Invalid key"),
  rotate: z.boolean().default(false),
});

export const claimBody = z.union([
  z.object({ pass: z.string().min(1).max(120) }),
  z.object({ reinvite: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "Invalid link") }),
]);

export const reinviteBody = z.object({ participantId: id("pt") });

/** "v1.<iv>.<ciphertext>" sealed on the device with a key that never reaches the server. */
export const HANDOFF_BLOB_PATTERN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,1200}$/;
export const HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;
export const handoffCreateBody = z.object({ blob: z.string().regex(HANDOFF_BLOB_PATTERN, "Invalid handoff") });
export const handoffClaimBody = z.object({ token: z.string().regex(HANDOFF_TOKEN_PATTERN, "Invalid link") });
