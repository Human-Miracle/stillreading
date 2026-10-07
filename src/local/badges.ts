"use client";
import { useMemo } from "react";
import { badgeInputFrom, badgeKey, badgeRarity, computeBadges, type BadgeId, type BadgeResult } from "@/lib/domain/badges";
import { apiRequest } from "./api";
import { getLocalDb } from "./db";
import type { ChallengeView } from "./hooks";

export interface ChallengeBadges {
  /** Everyone's badges, by participant id. */
  all: Map<string, BadgeResult[]>;
  /** My badges (empty when I'm not a member). */
  mine: BadgeResult[];
  rarity: (id: BadgeId, level: number) => { holders: number; readers: number };
}

/** Every member's badges in this challenge, from the data on this device. */
export function useChallengeBadges(view: ChallengeView | null | undefined): ChallengeBadges | null {
  return useMemo(() => {
    if (!view) return null;
    const reactions = [...view.reactionsBySession.values()].flat();
    const replies = [...view.repliesBySession.values()].flat();
    const all = computeBadges(
      badgeInputFrom({ challenge: view.challenge, today: view.today, members: view.members, reactions, replies }),
    );
    return {
      all,
      mine: all.get(view.challenge.myParticipantId) ?? [],
      rarity: (id, level) => badgeRarity(all, id, level),
    };
  }, [view]);
}

const seenKey = (challengeId: string) => `pref:badgesSeen:${challengeId}`;

/** Badge levels already celebrated on this device (null: never checked, so everything earned is new). */
export async function seenBadges(challengeId: string): Promise<Set<string>> {
  const row = await getLocalDb().kv.get(seenKey(challengeId));
  return new Set((row?.value as string[] | undefined) ?? []);
}

export async function markBadgesSeen(challengeId: string, keys: readonly string[]) {
  const seen = await seenBadges(challengeId);
  for (const k of keys) seen.add(k);
  await getLocalDb().kv.put({ key: seenKey(challengeId), value: [...seen] });
}

/** Every level up to and including the earned one, so lower levels never pop up after a higher one. */
export function earnedKeys(r: BadgeResult): string[] {
  return Array.from({ length: r.level }, (_, i) => badgeKey({ id: r.id, level: i + 1 }));
}

export interface PreparedShare {
  id: string;
  url: string;
  imageUrl: string;
  public: boolean;
}

/** Asks the server to check the badge and prepare its card. `isPublic` also turns on its public page. */
export function prepareBadgeShare(challengeId: string, badgeId: BadgeId, level: number, isPublic: boolean) {
  return apiRequest<PreparedShare>(`/api/challenges/${challengeId}/badges/share`, { method: "POST", body: { badgeId, level, public: isPublic } });
}
