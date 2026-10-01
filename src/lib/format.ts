import { addDays, diffDays } from "@/lib/domain/dates";

export function formatDateKey(date: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function relativeDayLabel(date: string, today: string) {
  const d = diffDays(date, today);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return formatDateKey(date, { weekday: "long", month: "short", day: "numeric" });
}

export function monthName(date: string) {
  return formatDateKey(date, { month: "long" });
}

export function timeAgo(iso: string, now = new Date()) {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export const n = (v: number) => v.toLocaleString("en-US");

export function inviteUrl(joinCode: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/join/${joinCode}`;
}

export { addDays };
