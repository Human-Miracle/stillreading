"use client";
import { createContext, useContext } from "react";
import type { ChallengeBadges } from "@/local/badges";
import type { ChallengeView } from "@/local/hooks";

export interface ChallengeContextValue {
  view: ChallengeView;
  badges: ChallengeBadges;
  openCheckIn: () => void;
}

export const ChallengeContext = createContext<ChallengeContextValue | null>(null);

export function useChallenge(): ChallengeContextValue {
  const ctx = useContext(ChallengeContext);
  if (!ctx) throw new Error("useChallenge must be used inside a challenge route");
  return ctx;
}
