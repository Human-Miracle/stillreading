import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { badgeShares } from "@/db/schema";
import { BADGE_BY_ID, type BadgeId } from "@/lib/domain/badges";

const SHARE_ID = /^[A-Za-z0-9_-]{16}$/;

export async function findBadgeShare(db: DbOrTx, id: string) {
  if (!SHARE_ID.test(id)) return null;
  const [row] = await db.select().from(badgeShares).where(eq(badgeShares.id, id));
  if (!row || !BADGE_BY_ID.has(row.badgeId as BadgeId)) return null;
  return { ...row, badgeId: row.badgeId as BadgeId };
}

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 600 | 800; style: "normal" }[]> | null = null;

/** Geist for the card images (woff: the image renderer can't read woff2). */
export function cardFonts() {
  fonts ??= Promise.all(
    ([400, 600, 800] as const).map(async (weight) => ({
      name: "Geist",
      data: await readFile(join(process.cwd(), "src/assets/fonts", `geist-${weight}.woff`)),
      weight,
      style: "normal" as const,
    })),
  );
  return fonts;
}
