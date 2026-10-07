"use client";
import { createContext, useContext } from "react";
import type { ChallengeView } from "@/local/hooks";

export interface ChallengeContextValue {
  view: ChallengeView;
  openCheckIn: () => void;
  /** Opens the check-in sheet set to Day 1 (while the Day One window is open). */
  openDayOneCheckIn: () => void;
}

export const ChallengeContext = createContext<ChallengeContextValue | null>(null);

export function useChallenge(): ChallengeContextValue {
  const ctx = useContext(ChallengeContext);
  if (!ctx) throw new Error("useChallenge must be used inside a challenge route");
  return ctx;
}
