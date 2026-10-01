import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "glass";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill font-medium tracking-[-0.01em] transition-[transform,background-color,opacity,box-shadow] duration-200 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none select-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink/90",
  secondary: "bg-surface text-ink shadow-soft hover:bg-white/80",
  ghost: "text-ink-2 hover:bg-ink/5",
  danger: "bg-[#ffe7e3] text-[#c2321f] hover:bg-[#ffdcd6]",
  glass: "bg-white/55 text-ink backdrop-blur-md hover:bg-white/75",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-12 px-6 text-[15px]",
  lg: "h-14 px-7 text-base",
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

const iconBase =
  "grid size-11 shrink-0 place-items-center rounded-full transition-[transform,background-color] duration-200 active:scale-95 disabled:opacity-40";
const iconVariants = {
  glass: "bg-white/60 text-ink backdrop-blur-md hover:bg-white/80",
  dashed: "border border-dashed border-ink/35 text-ink hover:bg-ink/5",
  solid: "bg-ink text-white",
  dark: "bg-white/10 text-white hover:bg-white/20",
} as const;

export function IconButton({
  label,
  variant = "glass",
  className,
  children,
  ...props
}: ComponentProps<"button"> & { label: string; variant?: keyof typeof iconVariants }) {
  return (
    <button type="button" aria-label={label} title={label} className={cn(iconBase, iconVariants[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function IconLink({ href, label, variant = "glass", className, children }: { href: string; label: string; variant?: keyof typeof iconVariants; className?: string; children: ReactNode }) {
  return (
    <Link href={href} aria-label={label} title={label} className={cn(iconBase, iconVariants[variant], className)}>
      {children}
    </Link>
  );
}
