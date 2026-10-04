import type { CSSProperties, ReactNode } from "react";
import { BADGES, type BadgeCategory, type BadgeId } from "@/lib/domain/badges";

/**
 * Badge artwork: bold sticker shapes in the app's palette with thick line art, a chunky number and a
 * tiny serial line (after vintage athletic stickers). Built only from divs with inline styles and
 * plain SVG, so the same art renders in the app and in shared images (next/og).
 */

export const INK = "#111111";
export const PAPER = "#f6f2ea";

export const CATEGORY_STYLE: Record<BadgeCategory | "efiko", { fill: string; art: string }> = {
  start: { fill: "#c8c7fb", art: INK },
  streak: { fill: "#f2683c", art: PAPER },
  time: { fill: "#bdd3f4", art: INK },
  volume: { fill: "#abc07f", art: INK },
  leaderboard: { fill: "#f6dd8b", art: INK },
  crew: { fill: "#f4bbd9", art: INK },
  efiko: { fill: INK, art: "#f6dd8b" },
};

/** The big type on a badge, per level where it changes. */
const LABELS: Partial<Record<BadgeId, string[]>> = {
  day_one: ["DAY 1"],
  hat_trick: ["3"],
  week_warrior: ["7"],
  fortnight_focus: ["14"],
  efiko: ["EFIKO"],
  century: ["100"],
  page_turner: ["250", "500", "1K", "2.5K"],
  goal_getter: ["7"],
  podium: ["TOP 3"],
  top_of_shelf: ["#1"],
  climber: ["+5"],
  hype_squad: ["25"],
};

const W = 200;
const H = 240;

/** Where the big type and the serial line sit, per silhouette (viewBox units). */
const LAYOUT: Record<BadgeCategory, { shift: number; label: number; serial: number }> = {
  start: { shift: 0, label: 150, serial: 204 },
  streak: { shift: 0, label: 150, serial: 208 },
  time: { shift: -8, label: 140, serial: 186 },
  volume: { shift: 0, label: 150, serial: 208 },
  leaderboard: { shift: -20, label: 122, serial: 184 },
  crew: { shift: 0, label: 150, serial: 206 },
};

function scallop(cx: number, cy: number, r: number, bumps: number): string {
  const pts = Array.from({ length: bumps }, (_, i) => {
    const a = (i / bumps) * Math.PI * 2 - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
  const chord = Math.hypot(pts[1]![0] - pts[0]![0], pts[1]![1] - pts[0]![1]);
  const br = (chord / 2) * 1.08;
  return `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)} ${pts
    .map((_, i) => {
      const p = pts[(i + 1) % bumps]!;
      return `A${br.toFixed(1)},${br.toFixed(1)} 0 0 1 ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    })
    .join(" ")} Z`;
}

/** The silhouette for a category (viewBox 200×240). */
function shape(category: BadgeCategory, props: { fill: string; stroke?: string; dash?: string }) {
  const common = { fill: props.fill, stroke: props.stroke ?? "none", strokeWidth: props.stroke ? 4 : 0, strokeDasharray: props.dash };
  switch (category) {
    case "start":
      return <rect x={10} y={8} width={180} height={224} rx={90} {...common} />;
    case "streak":
      return <path d="M28,10 H110 A80,80 0 0 1 190,90 V212 A18,18 0 0 1 172,230 H28 A18,18 0 0 1 10,212 V28 A18,18 0 0 1 28,10 Z" {...common} />;
    case "time":
      return <circle cx={100} cy={120} r={94} {...common} />;
    case "volume":
      return <rect x={14} y={10} width={172} height={220} rx={34} {...common} />;
    case "leaderboard":
      return <path d="M10,10 H150 A40,40 0 0 1 190,50 V198 H58 L10,234 Z" {...common} />;
    case "crew":
      return <path d={scallop(100, 118, 82, 12)} {...common} />;
  }
}

/** Line art, centred around (100, 100). */
function glyph(id: BadgeId, level: number, c: string): ReactNode {
  const line = { fill: "none", stroke: c, strokeWidth: 7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const solid = { fill: c, stroke: "none" };
  switch (id) {
    case "first_page":
      return (
        <g>
          <path d="M100,78 C85,68 62,66 46,70 V126 C62,122 85,124 100,134 C115,124 138,122 154,126 V70 C138,66 115,68 100,78 Z" {...line} />
          <path d="M100,78 V134" {...line} />
        </g>
      );
    case "day_one":
      return (
        <g>
          <rect x={60} y={62} width={80} height={70} rx={10} {...line} />
          <path d="M60,84 H140 M80,54 V70 M120,54 V70" {...line} />
        </g>
      );
    case "hat_trick":
    case "week_warrior":
    case "fortnight_focus":
      return (
        <g>
          <path d="M100,52 C112,72 132,84 132,108 C132,128 118,142 100,142 C82,142 68,128 68,108 C68,92 80,86 84,74 C90,86 96,90 100,92 C104,82 102,66 100,52 Z" {...line} />
          <path d="M100,142 C92,142 88,134 88,126 C88,116 96,112 100,104 C104,112 112,116 112,126 C112,134 108,142 100,142 Z" {...solid} />
        </g>
      );
    case "efiko":
      return (
        <g>
          {Array.from({ length: 7 }, (_, i) => {
            // A half sunburst rising behind the crown.
            const a = Math.PI + ((i + 1) / 8) * Math.PI;
            const x1 = 100 + 58 * Math.cos(a);
            const y1 = 112 + 58 * Math.sin(a);
            const x2 = 100 + 74 * Math.cos(a);
            const y2 = 112 + 74 * Math.sin(a);
            return <path key={i} d={`M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`} {...line} strokeWidth={5} />;
          })}
          <path d="M66,124 L73,84 L89,104 L100,76 L111,104 L127,84 L134,124 Z" {...line} />
          <path d="M66,138 H134" {...line} />
        </g>
      );
    case "comeback":
      return (
        <g>
          <path d="M138,100 A38,38 0 1 1 124,70" {...line} />
          <path d="M112,62 L126,70 L118,84" {...line} />
        </g>
      );
    case "weekend_reader":
      return (
        <g>
          <path d="M54,122 A23,23 0 0 1 100,122 Z" {...solid} />
          <path d="M100,122 A23,23 0 0 1 146,122 Z" {...line} />
          <path d="M44,122 H156" {...line} />
          <path d="M66,140 H88 M112,140 H134" {...line} strokeWidth={5} />
        </g>
      );
    case "early_bird":
      return (
        <g>
          <path d="M64,128 A36,36 0 0 1 136,128" {...line} />
          <path d="M48,128 H152" {...line} />
          <path d="M80,76 Q90,66 100,76 Q110,66 120,76" {...line} />
        </g>
      );
    case "dawn_reader":
      return (
        <g>
          <path d="M66,126 A34,34 0 0 1 134,126 Z" {...solid} />
          <path d="M48,126 H152 M100,66 V78 M62,82 L70,90 M138,82 L130,90 M58,142 H142" {...line} />
        </g>
      );
    case "night_owl":
      return (
        <g>
          <path d="M116,60 A42,42 0 1 0 140,118 A34,34 0 1 1 116,60 Z" {...solid} />
          <path d="M146,62 V78 M138,70 H154" {...line} strokeWidth={5} />
          <circle cx={150} cy={98} r={4} {...solid} />
        </g>
      );
    case "century":
    case "page_turner":
      return (
        <g>
          <path d="M76,58 H136 A6,6 0 0 1 142,64 V136" {...line} />
          <rect x={60} y={68} width={70} height={80} rx={6} {...line} />
          <path d="M74,90 H116 M74,106 H116 M74,122 H100" {...line} strokeWidth={5} />
        </g>
      );
    case "goal_getter":
      return (
        <g>
          <circle cx={96} cy={106} r={38} {...line} />
          <circle cx={96} cy={106} r={20} {...line} />
          <circle cx={96} cy={106} r={5} {...solid} />
          <path d="M96,106 L140,62 M126,62 H140 V76" {...line} />
        </g>
      );
    case "the_end":
      return (
        <g>
          <rect x={64} y={58} width={72} height={90} rx={8} {...line} />
          <path d="M80,58 V148" {...line} />
          <path d="M92,104 L104,116 L124,92" {...line} />
          {level >= 2 ? <path d="M136,150 q8,-10 16,0 t16,0" {...line} strokeWidth={5} /> : null}
        </g>
      );
    case "podium":
      return (
        <g>
          <path d="M54,144 V104 H84 V144 M84,144 V78 H116 V144 M116,144 V114 H146 V144 M46,144 H154" {...line} />
          <path d="M100,52 L104,62 L114,62 L106,68 L109,78 L100,72 L91,78 L94,68 L86,62 L96,62 Z" {...solid} />
        </g>
      );
    case "top_of_shelf":
      return (
        <g>
          <path d="M72,60 H128 V82 C128,102 116,114 100,114 C84,114 72,102 72,82 Z" {...line} />
          <path d="M72,68 H58 C58,86 64,94 76,96 M128,68 H142 C142,86 136,94 124,96 M100,114 V130 M80,140 H120" {...line} />
        </g>
      );
    case "daily_champion":
      return (
        <g>
          <path d="M82,52 L96,84 M118,52 L104,84" {...line} />
          <circle cx={100} cy={110} r={30} {...line} />
          <path d="M100,94 L104,104 L114,104 L106,110 L109,120 L100,114 L91,120 L94,110 L86,104 L96,104 Z" {...solid} />
        </g>
      );
    case "climber":
      return (
        <g>
          <path d="M52,144 H76 V120 H100 V96 H124 V72 H148" {...line} />
          <path d="M60,104 L104,60 M88,60 H104 V76" {...line} />
        </g>
      );
    case "hype_squad":
      return (
        <g>
          <path d="M60,64 H140 A12,12 0 0 1 152,76 V118 A12,12 0 0 1 140,130 H98 L76,148 V130 H60 A12,12 0 0 1 48,118 V76 A12,12 0 0 1 60,64 Z" {...line} />
          <path d="M100,116 C88,106 82,100 82,92 C82,86 87,82 92,82 C96,82 99,84 100,87 C101,84 104,82 108,82 C113,82 118,86 118,92 C118,100 112,106 100,116 Z" {...solid} />
        </g>
      );
  }
}

export interface BadgeArtProps {
  id: BadgeId;
  level?: number;
  /** Times earned, shown as ×N on repeatable badges. */
  count?: number;
  locked?: boolean;
  /** Width in px; height is 1.2× the width. */
  size: number;
  /** "inherit" in the app; the loaded font's name in generated images. */
  fontFamily?: string;
}

export function BadgeArt({ id, level = 1, count = 0, locked = false, size, fontFamily = "inherit" }: BadgeArtProps) {
  const def = BADGES.find((b) => b.id === id)!;
  const style = id === "efiko" ? CATEGORY_STYLE.efiko : CATEGORY_STYLE[def.category];
  const fill = locked ? "transparent" : style.fill;
  const art = locked ? "rgba(17,17,17,0.28)" : style.art;
  const label = LABELS[id]?.[Math.max(0, Math.min(LABELS[id]!.length, level) - 1)] ?? null;
  const k = size / W;
  const serial = String(BADGES.indexOf(def) + 1).padStart(2, "0");
  const layout = LAYOUT[def.category];
  const text = (s: CSSProperties): CSSProperties => ({ position: "absolute", left: 0, right: 0, display: "flex", justifyContent: "center", fontFamily, color: art, ...s });

  return (
    <div style={{ position: "relative", display: "flex", width: size, height: size * (H / W) }}>
      <svg width={size} height={size * (H / W)} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
        {shape(def.category, locked ? { fill, stroke: "rgba(17,17,17,0.22)", dash: "8 8" } : id === "efiko" ? { fill, stroke: style.art } : { fill })}
        {def.category === "volume" ? <path d="M30,46 H170" stroke={art} strokeWidth={3} strokeDasharray="6 7" fill="none" /> : null}
        <g transform={`translate(0,${(label ? -6 : 14) + layout.shift})`}>{glyph(id, level, art)}</g>
      </svg>
      {label ? (
        <div style={text({ top: (layout.label + (label.length > 3 ? 10 : 0)) * k, fontSize: (label.length > 3 ? 30 : label.length > 2 ? 44 : 52) * k, fontWeight: 800, letterSpacing: -1.5 * k, lineHeight: 1 })}>{label}</div>
      ) : null}
      <div style={text({ top: layout.serial * k, fontSize: 8.5 * k, fontWeight: 700, letterSpacing: 1.6 * k, opacity: 0.75, lineHeight: 1 })}>
        STILL READING · No.{serial}
      </div>
      {count > 1 && !locked ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 34 * k,
            minWidth: 34 * k,
            padding: `0 ${8 * k}px`,
            borderRadius: 999,
            background: INK,
            color: PAPER,
            fontFamily,
            fontSize: 15 * k,
            fontWeight: 700,
          }}
        >
          ×{count}
        </div>
      ) : null}
    </div>
  );
}
