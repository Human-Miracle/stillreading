import { cn } from "./cn";

const TONES = [
  "bg-[#f3d9c6] text-[#7a3412]",
  "bg-[#d8e6d3] text-[#28553a]",
  "bg-[#dcdff3] text-[#2f3a7a]",
  "bg-[#f4e3b5] text-[#6b4b00]",
  "bg-[#ecd4e4] text-[#6d2a57]",
  "bg-[#cfe6ea] text-[#1f5560]",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export function Avatar({ name, id, size = "md" }: { name: string; id: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-8 text-xs", md: "size-11 text-sm", lg: "size-16 text-xl" };
  return (
    <span aria-hidden className={cn("inline-grid shrink-0 place-items-center rounded-full font-bold", sizes[size], TONES[hash(id) % TONES.length])}>
      {initials(name)}
    </span>
  );
}
