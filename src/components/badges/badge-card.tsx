import type { BadgeSnapshot } from "@/db/schema";
import type { BadgeId } from "@/lib/domain/badges";
import { BadgeArt, INK } from "./badge-art";

/**
 * The shareable badge card, rendered to an image by next/og (so: divs with inline styles, flex
 * layout, one text string per element). A soft light background with the badge floating on it, the
 * reader's numbers and how rare the badge is.
 */

export type CardFormat = "story" | "square" | "og";

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  og: { width: 1200, height: 630 },
};

const BACKGROUND = "#efede9";

export function rarityLine(s: Pick<BadgeSnapshot, "holders" | "readers">): string | null {
  if (s.readers < 2 || s.holders < 1) return null;
  if (s.holders === 1) return `The only one of ${s.readers} readers with this`;
  if (s.holders <= s.readers / 4) return `Only ${s.holders} of ${s.readers} readers have this`;
  return `${s.holders} of ${s.readers} readers have this`;
}

export function BadgeCard({ snapshot, badgeId, level, format, site }: { snapshot: BadgeSnapshot; badgeId: BadgeId; level: number; format: CardFormat; site: string }) {
  const { width, height } = CARD_SIZES[format];
  const rarity = rarityLine(snapshot);
  const byline = `${snapshot.displayName} · ${snapshot.challengeName}`;
  const font = "Geist";
  const base = { display: "flex", fontFamily: font, color: INK } as const;
  const pill = (size: number, pad: string) => (
    <div style={{ display: "flex", alignSelf: format === "og" ? "flex-start" : "center", padding: pad, borderRadius: 999, background: INK, color: "#f6f2ea", fontSize: size, fontWeight: 600 }}>{rarity}</div>
  );

  if (format === "og") {
    return (
      <div style={{ ...base, width, height, background: BACKGROUND, alignItems: "center", padding: "0 80px", gap: 70 }}>
        <BadgeArt id={badgeId} level={level} count={snapshot.count} size={380} fontFamily={font} earnedOn={snapshot.earnedOn} owner={snapshot.displayName} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, opacity: 0.5 }}>Badge earned on Still Reading</div>
          <div style={{ display: "flex", fontSize: 78, fontWeight: 800, letterSpacing: -3.2, lineHeight: 1, marginTop: 14 }}>{snapshot.name}</div>
          {snapshot.stat ? <div style={{ display: "flex", fontSize: 34, opacity: 0.75, marginTop: 18 }}>{snapshot.stat}</div> : null}
          <div style={{ display: "flex", fontSize: 26, opacity: 0.5, marginTop: 20 }}>{byline}</div>
          {rarity ? <div style={{ display: "flex", marginTop: 26 }}>{pill(24, "10px 22px")}</div> : null}
        </div>
      </div>
    );
  }

  const story = format === "story";
  return (
    <div style={{ ...base, width, height, background: BACKGROUND, flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: story ? "96px 80px 0" : "56px 72px 0" }}>
        <div style={{ display: "flex", fontSize: story ? 40 : 32, fontWeight: 800, letterSpacing: -1.5 }}>Still Reading</div>
        <div style={{ display: "flex", fontSize: story ? 24 : 20, fontWeight: 600, letterSpacing: 4, opacity: 0.45 }}>BADGE EARNED</div>
      </div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 72px" }}>
        <BadgeArt id={badgeId} level={level} count={snapshot.count} size={story ? 620 : 400} fontFamily={font} earnedOn={snapshot.earnedOn} owner={snapshot.displayName} />
        <div style={{ display: "flex", fontSize: story ? 104 : 72, fontWeight: 800, letterSpacing: story ? -4.5 : -3, lineHeight: 1, marginTop: story ? 64 : 30, textAlign: "center" }}>{snapshot.name}</div>
        {snapshot.stat ? <div style={{ display: "flex", fontSize: story ? 46 : 32, opacity: 0.72, marginTop: story ? 24 : 12 }}>{snapshot.stat}</div> : null}
        {rarity ? <div style={{ display: "flex", marginTop: story ? 40 : 22 }}>{pill(story ? 34 : 24, story ? "16px 34px" : "10px 24px")}</div> : null}
        <div style={{ display: "flex", fontSize: story ? 34 : 24, opacity: 0.5, marginTop: story ? 36 : 18, textAlign: "center" }}>{byline}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", fontSize: story ? 28 : 20, fontWeight: 600, opacity: 0.4, paddingBottom: story ? 72 : 36 }}>{site}</div>
    </div>
  );
}
