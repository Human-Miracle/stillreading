"use client";
import Link from "next/link";
import { Wordmark } from "@/components/ui/misc";
import { useChallenges } from "@/local/hooks";

export default function OfflinePage() {
  const challenges = useChallenges()?.filter((c) => c.access === "ok") ?? [];
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4 text-center">
      <Wordmark className="text-3xl" />
      <h1 className="font-display text-3xl font-semibold">You&apos;re offline.</h1>
      <p className="text-ink-2">Your reading is still safe on this device. We&apos;ll sync when you&apos;re back.</p>
      {challenges.length ? (
        <ul className="mt-4 space-y-2 text-left">
          {challenges.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.id}`} className="block rounded-card border border-line bg-card px-5 py-4 font-display text-lg font-semibold shadow-card">
                {c.name} →
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
