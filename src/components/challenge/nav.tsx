"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../ui/cn";
import { Icon } from "../ui/icons";

/** Floating black bar with a raised pink check-in button (reference: health score app). */
export function BottomNav({ challengeId, onCheckIn, canCheckIn }: { challengeId: string; onCheckIn: () => void; canCheckIn: boolean }) {
  const pathname = usePathname();
  const base = `/c/${challengeId}`;
  const items = [
    { href: base, label: "Home", icon: Icon.home, exact: true },
    { href: `${base}/feed`, label: "Feed", icon: Icon.feed },
    { href: `${base}/people`, label: "People", icon: Icon.people },
    { href: `${base}/me`, label: "Me", icon: Icon.me },
  ];
  const link = (item: (typeof items)[number]) => {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    const I = item.icon;
    return (
      <li key={item.href} className="flex-1">
        <Link
          href={item.href}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          className={cn("relative mx-auto grid h-16 w-full place-items-center transition-colors", active ? "text-white" : "text-white/45 hover:text-white/75")}
        >
          <I className="size-[22px]" strokeWidth={active ? 2 : 1.7} />
          <span className={cn("absolute bottom-3 size-1 rounded-full bg-blush transition-opacity", active ? "opacity-100" : "opacity-0")} aria-hidden />
        </Link>
      </li>
    );
  };
  return (
    <nav data-bottom-nav aria-label="Challenge" className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[440px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <ul className="flex items-center rounded-[1.75rem] bg-ink px-2 shadow-float">
        {items.slice(0, 2).map(link)}
        <li className="flex flex-1 justify-center">
          {canCheckIn ? (
            <button
              type="button"
              onClick={onCheckIn}
              aria-label="Quick check-in"
              className="-my-3 grid size-14 place-items-center rounded-full bg-blush text-ink shadow-[0_0_0_6px_var(--ink)] transition-transform active:scale-95"
            >
              <Icon.plus className="size-6" strokeWidth={2} />
            </button>
          ) : (
            <Link href={`${base}/stats`} aria-label="Stats" className="-my-3 grid size-14 place-items-center rounded-full bg-butter text-ink shadow-[0_0_0_6px_var(--ink)]">
              <Icon.chart className="size-6" strokeWidth={2} />
            </Link>
          )}
        </li>
        {items.slice(2).map(link)}
      </ul>
    </nav>
  );
}
