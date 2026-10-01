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
