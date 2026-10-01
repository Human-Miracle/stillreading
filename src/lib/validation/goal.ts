import { z } from "zod";
import type { GoalPresetKind } from "@/lib/domain/goals";

export const PRESET_LIMITS: Record<GoalPresetKind, { min: number; max: number }> = {
  every_day: { min: 1, max: 1 },
  pages_per_day: { min: 1, max: 1000 },
  chapters_per_day: { min: 1, max: 100 },
  minutes_per_day: { min: 1, max: 1440 },
  books: { min: 1, max: 100 },
  total_pages: { min: 1, max: 100_000 },
};

export const goalPreset = z
  .object({
    kind: z.enum(["every_day", "pages_per_day", "chapters_per_day", "minutes_per_day", "books", "total_pages"]),
    value: z.number().int(),
  })
  .transform((p) => (p.kind === "every_day" ? { ...p, value: 1 } : p))
  .refine((p) => p.value >= PRESET_LIMITS[p.kind].min && p.value <= PRESET_LIMITS[p.kind].max, {
    message: "Goal amount is out of range",
    path: ["value"],
  });

export type GoalPresetInput = z.input<typeof goalPreset>;
