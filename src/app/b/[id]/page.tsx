import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeArt } from "@/components/badges/badge-art";
import { rarityLine } from "@/components/badges/badge-card";
import { Wordmark } from "@/components/ui/misc";
import { getDb } from "@/db/client";
import { BADGE_BY_ID } from "@/lib/domain/badges";
import { findBadgeShare } from "@/server/badge-share";

// A share can turn public at any moment: always render from the database, never from a cache.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const share = await findBadgeShare(await getDb(), id);
  return share?.public ? share : null;
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const share = await load(id);
  if (!share) return { title: "Badge", robots: { index: false } };
  const s = share.snapshot;
  const title = `${s.displayName} earned ${s.name} on Still Reading`;
  const description = [s.stat, rarityLine(s), s.challengeName].filter(Boolean).join(" · ");
  const image = { url: `${await origin()}/b/${id}/image?format=og`, width: 1200, height: 630, alt: `${s.name} badge` };
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/** A badge a reader chose to share: what it is, who earned it, and an invitation to start reading. */
export default async function BadgePage({ params }: Props) {
  const { id } = await params;
  const share = await load(id);
  if (!share) notFound();
  const s = share.snapshot;
  const rarity = rarityLine(s);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <nav className="py-2">
        <Link href="/" aria-label="Still Reading home">
          <Wordmark className="text-[19px]" />
        </Link>
      </nav>
      <section className="mt-6 flex flex-col items-center rounded-sheet bg-ink px-6 pb-8 pt-10 text-center text-paper">
        <BadgeArt id={share.badgeId} level={share.level} count={s.count} size={200} />
        <p className="mt-6 text-sm text-white/55">{s.displayName} earned</p>
        <h1 className="display mt-1 text-[52px] leading-none text-white">{s.name}</h1>
        {s.stat ? <p className="mt-3 text-[17px] text-white/80">{s.stat}</p> : null}
        {rarity ? <p className="mt-5 rounded-pill bg-butter px-4 py-2 text-sm font-medium text-ink">{rarity}</p> : null}
        <p className="mt-5 text-sm text-white/55">
          {s.challengeName}
          {s.dayNumber ? ` · Day ${s.dayNumber} of ${s.durationDays}` : ""}
        </p>
      </section>
      <section className="mt-6 space-y-3 text-center">
        <p className="text-[17px] text-ink/70">{BADGE_BY_ID.get(share.badgeId)!.how}. Still Reading is a reading challenge you do with friends: pick a book, set a goal, check in every day.</p>
        <Link href="/" className="flex h-14 w-full items-center justify-center rounded-pill bg-ink text-[17px] font-medium text-white">
          Start a reading challenge
        </Link>
      </section>
    </main>
  );
}
