import type { ComponentProps } from "react";
import { cn } from "./cn";

const PAD = { none: "overflow-hidden", sm: "p-4", md: "p-5", lg: "p-6" } as const;
const TONE = {
  surface: "bg-surface shadow-soft",
  muted: "bg-surface-2",
  blush: "bg-blush",
  butter: "bg-butter",
  sage: "bg-sage",
  lavender: "bg-lavender",
  sky: "bg-sky",
  glass: "bg-white/50 backdrop-blur-md",
} as const;

export type CardTone = keyof typeof TONE;

export function Card({ className, pad = "md", tone = "surface", ...props }: ComponentProps<"section"> & { pad?: keyof typeof PAD; tone?: CardTone }) {
  return <section className={cn("rounded-card", TONE[tone], PAD[pad], className)} {...props} />;
}

export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("eyebrow", className)} {...props} />;
}

/** White sheet that rises over a coloured hero (rounded top, full bleed). */
export function PageSheet({ className, overlap = true, ...props }: ComponentProps<"section"> & { overlap?: boolean }) {
  return <section className={cn("relative rounded-t-sheet bg-surface px-5 pb-8 pt-7", overlap ? "-mt-8" : "mt-6", className)} {...props} />;
}
