import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { bookFields } from "@/lib/validation/ops";
import type { DbOrTx } from "@/db/client";
import { books, type BookRow } from "@/db/schema";
import type { UpsertOutcome } from "./goals";

type BookInput = z.output<typeof bookFields>;

export async function upsertBook(
  db: DbOrTx,
  input: BookInput,
  ctx: { challengeId: string; participantId: string },
): Promise<UpsertOutcome<BookRow>> {
  const updatedAt = new Date(input.updatedAt);
  const values = {
    title: input.title,
    author: input.author || null,
    totalPages: input.totalPages ?? null,
    currentPage: input.currentPage,
    status: input.status,
    startedAt: input.startedAt ? new Date(input.startedAt) : null,
    completedAt: input.completedAt ? new Date(input.completedAt) : null,
    updatedAt,
  };
  const [existing] = await db.select().from(books).where(eq(books.id, input.id));
  if (existing) {
    if (existing.participantId !== ctx.participantId) return { kind: "forbidden" };
    if (existing.updatedAt > updatedAt) return { kind: "stale", row: existing };
    const [row] = await db
      .update(books)
      .set({ ...values, serverUpdatedAt: sql`now()` })
      .where(eq(books.id, input.id))
      .returning();
    return { kind: "ok", row: row! };
  }
  const [row] = await db
    .insert(books)
    .values({ id: input.id, challengeId: ctx.challengeId, participantId: ctx.participantId, ...values, createdAt: new Date(input.createdAt) })
    .returning();
  return { kind: "ok", row: row! };
}
