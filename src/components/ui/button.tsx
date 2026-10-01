import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition-[transform,background-color,opacity] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink shadow-card hover:brightness-105",
  secondary: "bg-card text-ink border border-line hover:bg-paper-2",
  ghost: "text-ink-2 hover:bg-paper-2",
  danger: "bg-danger-soft text-danger hover:brightness-95",
};
const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3.5 text-sm",
  md: "min-h-12 px-5 text-base",
  lg: "min-h-14 px-6 text-lg tracking-wide",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", full = false) {
  return cn(base, variants[variant], sizes[size], full && "w-full");
}

export function Button({
  variant = "primary",
  size = "md",
  full,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; full?: boolean }) {
  return <button type="button" className={cn(buttonClass(variant, size, full), className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  full,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  full?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn(buttonClass(variant, size, full), className)}>
      {children}
    </Link>
  );
}
