"use client";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { Wordmark } from "@/components/ui/misc";
import { useChallenges } from "@/local/hooks";

export default function OfflinePage() {
  const challenges = useChallenges()?.filter((c) => c.access === "ok") ?? [];
  return (
    <main className="mx-auto flex min-h-[85dvh] max-w-[440px] flex-col justify-center px-5">
      <Wordmark className="text-lg" />
      <h1 className="display mt-8 text-[52px]">
        You&apos;re offline.
        <br />
        <span className="text-ink/35">Your reading is safe.</span>
      </h1>
      <p className="mt-4 text-[17px] text-ink/60">Everything you log is saved on this device. We&apos;ll sync when you&apos;re back.</p>
      {challenges.length ? (
        <ul className="mt-8 rounded-sheet bg-surface px-5 py-2">
          {challenges.map((c) => (
            <li key={c.id} className="dotted">
              <Link href={`/c/${c.id}`} className="flex items-center justify-between py-4 text-[17px] font-medium tracking-[-0.02em]">
                {c.name}
                <Icon.chevron className="size-5 text-ink/40" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
