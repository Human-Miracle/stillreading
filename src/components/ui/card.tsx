import type { ComponentProps } from "react";
import { cn } from "./cn";

const PAD = { none: "overflow-hidden", sm: "p-4", md: "p-5" } as const;

export function Card({ className, pad = "md", ...props }: ComponentProps<"section"> & { pad?: keyof typeof PAD }) {
  return <section className={cn("rounded-card bg-card shadow-card border border-line/60", PAD[pad], className)} {...props} />;
}

export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-xs font-bold uppercase tracking-[0.14em] text-muted", className)} {...props} />;
}
