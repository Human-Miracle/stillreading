import { ImageResponse } from "next/og";
import { getDb } from "@/db/client";
import { BadgeCard, CARD_SIZES, type CardFormat } from "@/components/badges/badge-card";
import { cardFonts, findBadgeShare } from "@/server/badge-share";

export const dynamic = "force-dynamic";

/** The badge card as a PNG: story (9:16), square, or og (link previews). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const share = await findBadgeShare(await getDb(), id);
  if (!share) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const asked = url.searchParams.get("format");
  const format: CardFormat = asked === "story" || asked === "og" ? asked : "square";
  const download = url.searchParams.get("download") === "1";
  const image = new ImageResponse(<BadgeCard snapshot={share.snapshot} badgeId={share.badgeId} level={share.level} format={format} />, {
    ...CARD_SIZES[format],
    fonts: await cardFonts(),
  });
  const headers = new Headers(image.headers);
  headers.set("cache-control", "public, max-age=300");
  if (download) headers.set("content-disposition", `attachment; filename="still-reading-${share.badgeId.replace(/_/g, "-")}.png"`);
  return new Response(image.body, { status: 200, headers });
}
