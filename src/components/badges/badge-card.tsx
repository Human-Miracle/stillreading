import type { BadgeSnapshot } from "@/db/schema";
import type { BadgeId } from "@/lib/domain/badges";
import { BadgeArt, INK, PAPER } from "./badge-art";

/**
 * The shareable badge card, rendered to an image by next/og (so: divs with inline styles, flex
 * layout, one text string per element). Ink background so the badge pops, the reader's numbers, how
 * rare the badge is, and a strip of half circles in the app's colours.
 */

export type CardFormat = "story" | "square" | "og";

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  og: { width: 1200, height: 630 },
};

const STRIP = ["#f6dd8b", "#f2683c", "#f4bbd9", "#bdd3f4", "#abc07f", "#c8c7fb"];

export function rarityLine(s: Pick<BadgeSnapshot, "holders" | "readers">): string | null {
  if (s.readers < 2 || s.holders < 1) return null;
  if (s.holders === 1) return `The only one of ${s.readers} readers with this`;
  if (s.holders <= s.readers / 4) return `Only ${s.holders} of ${s.readers} readers have this`;
  return `${s.holders} of ${s.readers} readers have this`;
}

function Strip({ width, height }: { width: number; height: number }) {
  const d = height * 2;
  const count = Math.ceil(width / d) + 1;
  return (
    <div style={{ display: "flex", width, height, overflow: "hidden" }}>
      <svg width={count * d} height={height} viewBox={`0 0 ${count * d} ${height}`}>
        {Array.from({ length: count }, (_, i) => (
          <path key={i} d={`M${i * d},${height} A${height},${height} 0 0 1 ${i * d + d},${height} Z`} fill={STRIP[i % STRIP.length]} />
        ))}
      </svg>
    </div>
  );
}

export function BadgeCard({ snapshot, badgeId, level, format, site }: { snapshot: BadgeSnapshot; badgeId: BadgeId; level: number; format: CardFormat; site: string }) {
  const { width, height } = CARD_SIZES[format];
  const rarity = rarityLine(snapshot);
  const byline = `${snapshot.displayName} · ${snapshot.challengeName}`;
  const when = snapshot.dayNumber ? `Day ${snapshot.dayNumber} of ${snapshot.durationDays}` : null;
  const font = "Geist";
  const base = { display: "flex", fontFamily: font, color: PAPER } as const;

  if (format === "og") {
    return (
      <div style={{ ...base, width, height, background: INK, flexDirection: "column" }}>
        <div style={{ display: "flex", flex: 1, alignItems: "center", padding: "0 72px", gap: 64 }}>
          <BadgeArt id={badgeId} level={level} count={snapshot.count} size={300} fontFamily={font} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 600, opacity: 0.55 }}>Badge earned on Still Reading</div>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 800, letterSpacing: -3.5, lineHeight: 1, marginTop: 14 }}>{snapshot.name}</div>
            {snapshot.stat ? <div style={{ display: "flex", fontSize: 36, opacity: 0.8, marginTop: 18 }}>{snapshot.stat}</div> : null}
            <div style={{ display: "flex", fontSize: 28, opacity: 0.55, marginTop: 22 }}>{byline}</div>
            {rarity ? (
              <div style={{ display: "flex", alignSelf: "flex-start", marginTop: 26, padding: "10px 22px", borderRadius: 999, background: "#f6dd8b", color: INK, fontSize: 26, fontWeight: 600 }}>{rarity}</div>
            ) : null}
          </div>
        </div>
        <Strip width={width} height={56} />
      </div>
    );
  }

  const story = format === "story";
  const art = story ? 560 : 360;
  return (
    <div style={{ ...base, width, height, background: INK, flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: story ? "96px 80px 0" : "64px 72px 0" }}>
        <div style={{ display: "flex", fontSize: story ? 40 : 34, fontWeight: 800, letterSpacing: -1.5 }}>Still Reading</div>
        <div style={{ display: "flex", fontSize: story ? 26 : 22, fontWeight: 600, letterSpacing: 4, opacity: 0.55 }}>BADGE EARNED</div>
      </div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 72px" }}>
        <BadgeArt id={badgeId} level={level} count={snapshot.count} size={art} fontFamily={font} />
        <div style={{ display: "flex", fontSize: story ? 128 : 92, fontWeight: 800, letterSpacing: story ? -6 : -4, lineHeight: 1, marginTop: story ? 72 : 44, textAlign: "center" }}>{snapshot.name}</div>
        {snapshot.stat ? <div style={{ display: "flex", fontSize: story ? 50 : 38, opacity: 0.8, marginTop: story ? 28 : 18 }}>{snapshot.stat}</div> : null}
        {rarity ? (
          <div style={{ display: "flex", marginTop: story ? 44 : 28, padding: story ? "16px 34px" : "12px 26px", borderRadius: 999, background: "#f6dd8b", color: INK, fontSize: story ? 36 : 28, fontWeight: 600 }}>{rarity}</div>
        ) : null}
        <div style={{ display: "flex", fontSize: story ? 36 : 28, opacity: 0.55, marginTop: story ? 44 : 26, textAlign: "center" }}>{byline}</div>
        {when ? <div style={{ display: "flex", fontSize: story ? 30 : 24, opacity: 0.4, marginTop: 10 }}>{when}</div> : null}
      </div>
      <div style={{ display: "flex", justifyContent: "center", fontSize: story ? 28 : 22, fontWeight: 600, opacity: 0.45, paddingBottom: story ? 36 : 22 }}>{site}</div>
      <Strip width={width} height={story ? 150 : 84} />
    </div>
  );
}
