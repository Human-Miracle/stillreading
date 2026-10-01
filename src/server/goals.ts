import { and, eq, sql } from "drizzle-orm";
import { goalFromPreset } from "@/lib/domain/goals";
import type { goalFields } from "@/lib/validation/ops";
import type { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { goals, type GoalRow } from "@/db/schema";

type GoalInput = z.output<typeof goalFields>;

export type UpsertOutcome<T> = { kind: "ok"; row: T } | { kind: "stale"; row: T } | { kind: "forbidden" };

/** Goals are unique per (participant, priority); fields are always derived from the preset server-side. */
export async function upsertGoal(
  db: DbOrTx,
  input: GoalInput,
  ctx: { challengeId: string; participantId: string; durationDays: number },
): Promise<UpsertOutcome<GoalRow>> {
  const fields = goalFromPreset(input.preset, ctx.durationDays);
  const updatedAt = new Date(input.updatedAt);
  const [existing] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.participantId, ctx.participantId), eq(goals.priority, input.priority)));

  if (existing) {
    if (existing.updatedAt > updatedAt) return { kind: "stale", row: existing };
    const [row] = await db
      .update(goals)
      .set({ ...fields, updatedAt, deletedAt: null, serverUpdatedAt: sql`now()` })
      .where(eq(goals.id, existing.id))
      .returning();
    return { kind: "ok", row: row! };
  }

  const [byId] = await db.select().from(goals).where(eq(goals.id, input.id));
  if (byId) return { kind: "forbidden" };

  const [row] = await db
    .insert(goals)
    .values({
      id: input.id,
      challengeId: ctx.challengeId,
      participantId: ctx.participantId,
      priority: input.priority,
      ...fields,
      createdAt: new Date(input.createdAt),
      updatedAt,
    })
    .returning();
  return { kind: "ok", row: row! };
}
