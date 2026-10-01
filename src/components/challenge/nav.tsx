"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../ui/cn";

const ICONS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  feed: <path d="M4 5h16M4 12h16M4 19h10" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.5 3 5.2" />
    </>
  ),
  me: (
    <>
      <path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z" />
      <path d="M9 9h6M9 13h4" />
    </>
  ),
};

export function BottomNav({ challengeId }: { challengeId: string }) {
  const pathname = usePathname();
  const base = `/c/${challengeId}`;
  const items = [
    { href: base, label: "Home", icon: ICONS.home, exact: true },
    { href: `${base}/feed`, label: "Feed", icon: ICONS.feed },
    { href: `${base}/people`, label: "People", icon: ICONS.people },
    { href: `${base}/me`, label: "Me", icon: ICONS.me },
  ];
  return (
    <nav aria-label="Challenge" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold", active ? "text-accent" : "text-muted hover:text-ink")}
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {item.icon}
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
