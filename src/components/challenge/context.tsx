"use client";
import { createContext, useContext } from "react";
import type { CheckInDay } from "@/components/check-in/check-in-composer";
import type { ChallengeBadges } from "@/local/badges";
import type { ChallengeView } from "@/local/hooks";

export interface ChallengeContextValue {
  view: ChallengeView;
  badges: ChallengeBadges;
  /** Opens the check-in; "yesterday" starts it on yesterday (e.g. to spend a Time Stone). */
  openCheckIn: (day?: CheckInDay) => void;
}

export const ChallengeContext = createContext<ChallengeContextValue | null>(null);

export function useChallenge(): ChallengeContextValue {
  const ctx = useContext(ChallengeContext);
  if (!ctx) throw new Error("useChallenge must be used inside a challenge route");
  return ctx;
}
