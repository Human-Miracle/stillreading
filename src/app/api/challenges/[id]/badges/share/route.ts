import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { badgeShares, type BadgeSnapshot } from "@/db/schema";
import { BADGES, badgeName, badgeRarity, type BadgeId } from "@/lib/domain/badges";
import { diffDays } from "@/lib/domain/dates";
import { ID_PATTERN } from "@/lib/ids";
import { authenticateDevice, findMembership, membershipFailure } from "@/server/auth";
import { challengeBadges } from "@/server/badges";
import { ApiError, json, readJson, route } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const body = z.object({
  badgeId: z.enum(BADGES.map((b) => b.id) as [BadgeId, ...BadgeId[]]),
  level: z.number().int().min(1).max(4),
  /** Sharing a link makes the badge's page public; saving the image doesn't. */
  public: z.boolean().optional(),
});

/**
 * Prepares one of my badges for saving or sharing. The server works the badge out from the challenge's
 * data first, so a badge can only be shared once it's really earned.
 */
export const POST = route("POST /api/challenges/:id/badges/share", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!ID_PATTERN("ch").test(id)) throw new ApiError(404, "not_found", "Challenge not found");
  const db = await getDb();
  const deviceId = await authenticateDevice(db, req);
  await rateLimit(db, LIMITS.badgeShare, deviceId);
  const me = await findMembership(db, id, deviceId);
  if (membershipFailure(me)) throw new ApiError(404, "not_found", "Challenge not found");
  const input = body.parse(await readJson(req));

  const loaded = await challengeBadges(db, id);
  const mine = loaded?.all.get(me!.id)?.find((b) => b.id === input.badgeId);
  if (!loaded || !mine || mine.level < input.level) throw new ApiError(403, "not_earned", "You haven't earned this badge yet.");

  const rarity = badgeRarity(loaded.all, input.badgeId, input.level);
  const snapshot: BadgeSnapshot = {
    name: badgeName(input.badgeId, input.level),
    displayName: me!.displayName,
    challengeName: loaded.challenge.name,
    stat: mine.level === input.level ? mine.stat : null,
    earnedOn: mine.level === input.level ? mine.earnedOn : null,
    dayNumber: mine.level === input.level && mine.earnedOn ? diffDays(loaded.challenge.startDate, mine.earnedOn) + 1 : null,
    durationDays: loaded.challenge.durationDays,
    count: mine.count,
    holders: rarity.holders,
    readers: rarity.readers,
  };

  const [existing] = await db
    .select()
    .from(badgeShares)
    .where(and(eq(badgeShares.participantId, me!.id), eq(badgeShares.badgeId, input.badgeId), eq(badgeShares.level, input.level)));
  const isPublic = (existing?.public ?? false) || input.public === true;
  const shareId = existing?.id ?? randomBytes(12).toString("base64url");
  if (existing) {
    await db.update(badgeShares).set({ snapshot, public: isPublic, updatedAt: new Date() }).where(eq(badgeShares.id, shareId));
  } else {
    await db.insert(badgeShares).values({ id: shareId, challengeId: id, participantId: me!.id, badgeId: input.badgeId, level: input.level, public: isPublic, snapshot });
  }
  return json({ id: shareId, url: `/b/${shareId}`, imageUrl: `/b/${shareId}/image`, public: isPublic });
});
