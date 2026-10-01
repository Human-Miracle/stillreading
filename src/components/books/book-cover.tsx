"use client";
import { useState } from "react";
import type { LocalBook } from "@/local/db";
import { hash } from "../ui/avatar";
import { cn } from "../ui/cn";
import { useLookedUpCover } from "./cover-lookup";
import { wasCoverChecked } from "./use-cover-backfill";

const SCHEMES = [
  { bg: "#f2683c", fg: "#1a1a1a" },
  { bg: "#f6dd8b", fg: "#1a1a1a" },
  { bg: "#111111", fg: "#f6f2ea" },
  { bg: "#c8c7fb", fg: "#1a1a1a" },
  { bg: "#abc07f", fg: "#1a1a1a" },
  { bg: "#f4bbd9", fg: "#1a1a1a" },
  { bg: "#bdd3f4", fg: "#1a1a1a" },
  { bg: "#f6f2ea", fg: "#1a1a1a" },
];

type CoverBook = Pick<LocalBook, "id" | "title" | "author" | "status"> & { coverUrl?: string | null };

function DoneBadge() {
  return <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-white text-[10px] font-bold text-ink">✓</span>;
}

/** The book's real cover when it has one (from Open Library), otherwise a generated typographic cover. */
export function BookCover({ book, className }: { book: CoverBook; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // No saved cover (e.g. another reader's book added by hand): show one found on Open Library, unless
  // this device already looked for it — or its reader removed the cover on purpose.
  const lookedUp = useLookedUpCover(book, !book.coverUrl && !wasCoverChecked(book.id));
  const src = book.coverUrl ?? lookedUp;
  if (src && failedUrl !== src) {
    return (
      <div className={cn("relative aspect-[2/3] overflow-hidden rounded-md bg-surface-2 shadow-[0_6px_16px_rgb(17_17_17/0.18)]", className)} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote cover, no image optimisation needed */}
        <img src={src} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailedUrl(src)} />
        {book.status === "completed" ? <DoneBadge /> : null}
      </div>
    );
  }
  return <GeneratedCover book={book} className={className} />;
}

/**
 * Generated typographic cover (no external images): colour and layout are derived from the book id,
 * so every book keeps the same cover on every device.
 */
function GeneratedCover({ book, className }: { book: CoverBook; className?: string }) {
  const h = hash(book.id);
  const scheme = SCHEMES[h % SCHEMES.length]!;
  const variant = (h >> 3) % 3;
  const title = book.title;
  return (
    <div
      className={cn("relative aspect-[2/3] overflow-hidden rounded-md shadow-[0_6px_16px_rgb(17_17_17/0.18)]", className)}
      style={{ background: scheme.bg, color: scheme.fg }}
      aria-hidden
    >
      {variant === 0 ? (
        <div className="flex h-full flex-col justify-between p-2.5">
          <p className="truncate text-[8px] uppercase tracking-[0.12em] opacity-70">{book.author ?? "Still Reading"}</p>
          <p className="line-clamp-4 text-[17px] font-semibold leading-[0.95] tracking-[-0.05em]">{title}</p>
        </div>
      ) : variant === 1 ? (
        <div className="flex h-full justify-end overflow-hidden p-1.5">
          <p className="line-clamp-2 rotate-180 text-[30px] font-semibold leading-[0.85] tracking-[-0.06em]" style={{ writingMode: "vertical-rl" }}>
            {title}
          </p>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex h-[38%]">
            <span className="w-1/3 bg-[#f6dd8b]" />
            <span className="w-1/3 bg-[#f2683c]" />
            <span className="w-1/3 bg-[#bdd3f4]" />
          </div>
          <div className="flex flex-1 flex-col justify-end p-2.5">
            <p className="line-clamp-3 text-[14px] font-semibold leading-none tracking-[-0.04em]">{title}</p>
            {book.author ? <p className="mt-1 truncate text-[8px] opacity-70">{book.author}</p> : null}
          </div>
        </div>
      )}
      {book.status === "completed" ? <DoneBadge /> : null}
    </div>
  );
}
