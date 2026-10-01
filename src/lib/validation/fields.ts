import { z } from "zod";
import { isDateKey, isValidTimezone } from "@/lib/domain/dates";
import { BOOK_STATUSES, REACTION_TYPES, SESSION_UNITS } from "@/lib/domain/types";
import { COVER_HOST } from "@/lib/book-search";
import { ID_PATTERN, type IdPrefix } from "@/lib/ids";

// Strip control characters (keeps newlines in multi-line text) and trim.
const clean = (multiline: boolean) => (v: string) =>
  v.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, "").trim();

export const id = (prefix: IdPrefix) => z.string().regex(ID_PATTERN(prefix), `Invalid ${prefix} id`);

export const displayName = z.string().transform(clean(false)).pipe(z.string().min(1, "Name is required").max(40, "Name must be 40 characters or fewer"));
export const challengeName = z.string().transform(clean(false)).pipe(z.string().min(1, "Give your challenge a name").max(80));
export const description = z.string().transform(clean(true)).pipe(z.string().max(500));
export const reflection = z.string().transform(clean(true)).pipe(z.string().max(500, "Keep it under 500 characters"));
export const bookTitle = z.string().transform(clean(false)).pipe(z.string().min(1, "Title is required").max(200));
export const bookAuthor = z.string().transform(clean(false)).pipe(z.string().max(120));
/** Cover images are shown to every reader in the challenge, so only Open Library cover URLs are accepted. */
export const coverUrl = z
  .string()
  .max(300)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && u.hostname === COVER_HOST && !u.username && !u.password && !u.port;
    } catch {
      return false;
    }
  }, "Unsupported cover image");

export const dateKey = z.string().refine(isDateKey, "Invalid date");
export const timezone = z.string().max(64).refine(isValidTimezone, "Invalid timezone");
export const isoTimestamp = z.iso.datetime({ offset: true });

export const sessionUnit = z.enum(SESSION_UNITS);
export const reactionType = z.enum(REACTION_TYPES);
export const bookStatus = z.enum(BOOK_STATUSES);

export const amount = z.number().int("Use a whole number").positive("Amount must be more than 0").max(10_000);
export const pageCount = z.number().int().min(1).max(20_000);
export const joinCode = z.string().regex(/^[0-9A-Za-z]{6,32}$/, "Invalid invite code");
