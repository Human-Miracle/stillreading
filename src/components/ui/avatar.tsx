import { cn } from "./cn";

const TONES = ["bg-butter", "bg-sage", "bg-blush", "bg-lavender", "bg-sky"] as const;
export const TINTS = ["butter", "sage", "blush", "lavender", "sky"] as const;

export function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function tintFor(id: string) {
  return TINTS[hash(id) % TINTS.length]!;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export function Avatar({ name, id, size = "md", className }: { name: string; id: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sizes = { sm: "size-8 text-[11px]", md: "size-11 text-[13px]", lg: "size-14 text-base", xl: "size-20 text-2xl" };
  return (
    <span aria-hidden className={cn("inline-grid shrink-0 place-items-center rounded-full font-medium tracking-tight text-ink", sizes[size], TONES[hash(id) % TONES.length], className)}>
      {initials(name)}
    </span>
  );
}
