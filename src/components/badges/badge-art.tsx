import type { CSSProperties, ReactNode } from "react";
import { BADGES, badgeName, type BadgeCategory, type BadgeId } from "@/lib/domain/badges";

/**
 * Badge artwork, after collectible cards and certification seals: a die-cut frame (ticket, wavy,
 * stamp, stadium or rounded card), a gradient made of soft overlapping glows in the app's colours,
 * faint guide lines, a glossy emblem, curved lettering and small-caps labels.
 *
 * Built only from divs with inline styles and plain SVG, so the same art renders in the app and in
 * shared images (next/og). Curved text is laid out letter by letter for the same reason.
 */

export const INK = "#111111";
export const PAPER = "#f6f2ea";

type Frame = "ticket" | "wavy" | "stamp" | "stadium" | "card";

interface Theme {
  frame: Frame;
  /** Diagonal base, from top-left to bottom-right. */
  stops: [string, string, string];
  /** Soft glows layered on top: [colour, cx, cy, r] in viewBox units. */
  glows: [string, number, number, number][];
  /** For numbers drawn on the emblem and the seal. */
  deep: string;
  rim: string;
  text: string;
}

const THEMES: Record<BadgeCategory | "efiko", Theme> = {
  start: {
    frame: "ticket",
    stops: ["#8d89f2", "#c8c7fb", "#a7c3f4"],
    glows: [["#ffffff", 100, 140, 70], ["#bdd3f4", 170, 230, 90], ["#9f9bf6", 30, 40, 80]],
    deep: "#5f5bd6",
    rim: "#ffffff",
    text: "#ffffff",
  },
  streak: {
    frame: "wavy",
    stops: ["#f2683c", "#f49a6a", "#f6d27a"],
    glows: [["#fff1df", 100, 140, 66], ["#f4bbd9", 30, 230, 90], ["#f2683c", 170, 40, 80]],
    deep: "#d9481d",
    rim: "#ffffff",
    text: "#ffffff",
  },
  time: {
    frame: "stamp",
    stops: ["#5d84de", "#a9c4f2", "#c8c7fb"],
    glows: [["#f2f6ff", 100, 140, 64], ["#c8c7fb", 170, 230, 90], ["#4f74d1", 30, 40, 80]],
    deep: "#3d63c4",
    rim: "#ffffff",
    text: "#ffffff",
  },
  volume: {
    frame: "stadium",
    stops: ["#9a8ff0", "#f2683c", "#f4bbd9"],
    glows: [["#8f86ee", 100, 20, 110], ["#f2683c", 100, 140, 80], ["#f4bbd9", 100, 260, 100]],
    deep: "#e2572c",
    rim: "#efeaff",
    text: "#ffffff",
  },
  leaderboard: {
    frame: "card",
    stops: ["#f2683c", "#f4bbd9", "#c8c7fb"],
    glows: [["#f6dd8b", 40, 230, 100], ["#bdd3f4", 180, 120, 90], ["#c8c7fb", 120, 30, 90], ["#ffffff", 100, 120, 50]],
    deep: "#e2572c",
    rim: "#ffffff",
    text: "#1d1a24",
  },
  crew: {
    frame: "ticket",
    stops: ["#e67bb2", "#f4bbd9", "#b9cd8e"],
    glows: [["#fff0f7", 100, 140, 66], ["#abc07f", 175, 235, 90], ["#e46aa8", 25, 35, 80]],
    deep: "#c44c8b",
    rim: "#ffffff",
    text: "#ffffff",
  },
  efiko: {
    frame: "wavy",
    stops: ["#2a2a2a", "#161616", "#0b0b0b"],
    glows: [["#3a3a3a", 100, 140, 80], ["#f2b544", 100, 150, 46]],
    deep: "#111111",
    rim: "#111111",
    text: "#f6dd8b",
  },
};

const LOCKED: Theme = { frame: "ticket", stops: ["#ece8e1", "#ece8e1", "#ece8e1"], glows: [], deep: "#c9c3b8", rim: "#f6f3ee", text: "#b3ac9f" };

/** Small caps line under the name. */
const TAGLINES: Record<BadgeId, string[]> = {
  first_page: ["FIRST CHECK-IN"],
  day_one: ["READ ON DAY ONE"],
  hat_trick: ["3 DAYS IN A ROW"],
  week_warrior: ["7 DAYS IN A ROW"],
  fortnight_focus: ["14 DAYS IN A ROW"],
  efiko: ["EVERY SINGLE DAY"],
  comeback: ["BACK, 3 DAYS STRAIGHT"],
  weekend_reader: ["SATURDAY + SUNDAY"],
  early_bird: ["FIRST TO LOG"],
  dawn_reader: ["BEFORE 7AM"],
  night_owl: ["AFTER 10PM"],
  century: ["100 PAGES IN A DAY"],
  page_turner: ["250 PAGES READ", "500 PAGES READ", "1,000 PAGES READ", "2,500 PAGES READ"],
  goal_getter: ["7 GOAL DAYS"],
  the_end: ["BOOK FINISHED", "3 BOOKS FINISHED"],
  podium: ["TOP 3 FINISH"],
  top_of_shelf: ["NO. 1 FINISH"],
  daily_champion: ["MOST PAGES IN A DAY"],
  climber: ["UP 5+ PLACES"],
  hype_squad: ["25 CHEERS FOR THE CREW"],
};

/** Numbers printed on the emblem. */
const NUMERALS: Partial<Record<BadgeId, string[]>> = {
  day_one: ["1"],
  hat_trick: ["3"],
  week_warrior: ["7"],
  fortnight_focus: ["14"],
  the_end: ["", "3"],
};

/** The framed label on leaderboard cards. */
const CARD_LABELS: Partial<Record<BadgeId, string>> = { podium: "TOP 3", top_of_shelf: "NO. 1", daily_champion: "CHAMPION", climber: "CLIMBER" };

const W = 200;
const H = 260;

function pick<T>(list: readonly T[] | undefined, level: number): T | undefined {
  if (!list?.length) return undefined;
  return list[Math.max(0, Math.min(list.length, level) - 1)];
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/** A rectangle whose edges are made of outward bumps (the wavy card). */
function wavyPath(x: number, y: number, w: number, h: number, r: number): string {
  const nx = Math.max(3, Math.round(w / (r * 2)));
  const ny = Math.max(3, Math.round(h / (r * 2)));
  const sx = w / nx;
  const sy = h / ny;
  const ax = (sx / 2) * 1.02;
  const ay = (sy / 2) * 1.02;
  let d = `M${x},${y}`;
  for (let i = 0; i < nx; i++) d += ` A${ax},${ax} 0 0 1 ${x + sx * (i + 1)},${y}`;
  for (let i = 0; i < ny; i++) d += ` A${ay},${ay} 0 0 1 ${x + w},${y + sy * (i + 1)}`;
  for (let i = 0; i < nx; i++) d += ` A${ax},${ax} 0 0 1 ${x + w - sx * (i + 1)},${y + h}`;
  for (let i = 0; i < ny; i++) d += ` A${ay},${ay} 0 0 1 ${x},${y + h - sy * (i + 1)}`;
  return `${d} Z`;
}

/** A rectangle with half-circle bites along every edge (the postage stamp). */
function stampPath(x: number, y: number, w: number, h: number, r: number, gap: number): string {
  const nx = Math.max(2, Math.round(w / gap));
  const ny = Math.max(2, Math.round(h / gap));
  const sx = w / nx;
  const sy = h / ny;
  let d = `M${x},${y}`;
  for (let i = 0; i < nx; i++) {
    const c = x + sx * (i + 0.5);
    d += ` L${c - r},${y} A${r},${r} 0 0 0 ${c + r},${y}`;
  }
  d += ` L${x + w},${y}`;
  for (let i = 0; i < ny; i++) {
    const c = y + sy * (i + 0.5);
    d += ` L${x + w},${c - r} A${r},${r} 0 0 0 ${x + w},${c + r}`;
  }
  d += ` L${x + w},${y + h}`;
  for (let i = 0; i < nx; i++) {
    const c = x + w - sx * (i + 0.5);
    d += ` L${c + r},${y + h} A${r},${r} 0 0 0 ${c - r},${y + h}`;
  }
  d += ` L${x},${y + h}`;
  for (let i = 0; i < ny; i++) {
    const c = y + h - sy * (i + 0.5);
    d += ` L${x},${c + r} A${r},${r} 0 0 0 ${x},${c - r}`;
  }
  return `${d} Z`;
}

/** A rectangle with concave corners and a step near the top (the ticket). */
function ticketPath(x: number, y: number, w: number, h: number, r: number): string {
  const s = 7; // the small step under each top corner
  return [
    `M${x + r},${y}`,
    `H${x + w - r}`,
    `A${r},${r} 0 0 0 ${x + w},${y + r}`,
    `V${y + r + 26} H${x + w - s} V${y + r + 40} H${x + w}`,
    `V${y + h - r}`,
    `A${r},${r} 0 0 0 ${x + w - r},${y + h}`,
    `H${x + r}`,
    `A${r},${r} 0 0 0 ${x},${y + h - r}`,
    `V${y + r + 40} H${x + s} V${y + r + 26} H${x}`,
    `V${y + r}`,
    `A${r},${r} 0 0 0 ${x + r},${y}`,
    "Z",
  ].join(" ");
}

function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return `M${x + rr},${y} H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} H${x + rr} A${rr},${rr} 0 0 1 ${x},${y + h - rr} V${y + rr} A${rr},${rr} 0 0 1 ${x + rr},${y} Z`;
}

/** The outer die-cut and the inner gradient panel for each frame. */
function frameShapes(frame: Frame): { outer: string; panel: string; border?: string } {
  switch (frame) {
    case "ticket":
      return { outer: ticketPath(8, 22, 184, 230, 14), panel: roundRect(17, 31, 166, 212, 12) };
    case "wavy":
      return { outer: wavyPath(14, 28, 172, 218, 9), panel: roundRect(22, 36, 156, 202, 14) };
    case "stamp":
      return { outer: stampPath(8, 22, 184, 230, 4.2, 12), panel: roundRect(18, 32, 164, 210, 3) };
    case "stadium":
      return { outer: roundRect(10, 8, 180, 246, 90), panel: roundRect(16, 14, 168, 234, 84), border: roundRect(25, 23, 150, 216, 75) };
    case "card":
      return { outer: roundRect(10, 16, 180, 236, 36), panel: roundRect(16, 22, 168, 224, 30), border: roundRect(24, 30, 152, 208, 22) };
  }
}

// ---------------------------------------------------------------------------
// Emblems: glossy filled shapes in a 100×100 box
// ---------------------------------------------------------------------------

function emblem(id: BadgeId, fill: string, deep: string): ReactNode {
  const f = { fill };
  const line = { fill: "none", stroke: fill, strokeWidth: 7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "first_page":
      return (
        <g>
          <path d="M48.5,26 C39,18 22,16 8,20 V78 C22,74 39,76 48.5,84 Z" {...f} />
          <path d="M51.5,26 C61,18 78,16 92,20 V78 C78,74 61,76 51.5,84 Z" {...f} />
        </g>
      );
    case "day_one":
      return (
        <g>
          <path d={roundRect(8, 22, 84, 70, 14)} {...f} />
          <path d={roundRect(26, 10, 10, 22, 5)} {...f} />
          <path d={roundRect(64, 10, 10, 22, 5)} {...f} />
          <path d="M8,42 H92" stroke={deep} strokeOpacity={0.18} strokeWidth={3} />
        </g>
      );
    case "hat_trick":
    case "week_warrior":
    case "fortnight_focus":
      return <path d="M50,2 C61,22 84,36 84,63 C84,85 68,99 50,99 C32,99 16,85 16,63 C16,46 29,37 33,22 C40,35 46,40 50,42 C54,30 53,15 50,2 Z" {...f} />;
    case "efiko":
      return (
        <g>
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
            return <circle key={i} cx={50 + 26 * Math.cos(a)} cy={50 + 26 * Math.sin(a)} r={19} {...f} />;
          })}
          <circle cx={50} cy={50} r={26} {...f} />
        </g>
      );
    case "comeback":
      return (
        <g>
          <path d="M80,50 A30,30 0 1 1 70,27" {...line} strokeWidth={15} />
          <path d="M58,8 L86,22 L66,44 Z" {...f} />
        </g>
      );
    case "weekend_reader":
      return (
        <g>
          <circle cx={36} cy={52} r={28} {...f} />
          <circle cx={64} cy={52} r={28} {...f} fillOpacity={0.8} />
        </g>
      );
    case "early_bird":
      return <path d="M4,50 C20,34 38,38 50,54 C62,38 80,34 96,50 C80,47 64,55 50,74 C36,55 20,47 4,50 Z" {...f} />;
    case "dawn_reader":
      return (
        <g>
          <path d="M14,74 A36,36 0 0 1 86,74 Z" {...f} />
          {[-60, -30, 0, 30, 60].map((a) => (
            <path key={a} d="M50,26 V12" {...line} strokeWidth={7} transform={`rotate(${a} 50 74)`} />
          ))}
          <path d="M6,86 H94" {...line} strokeWidth={6} />
        </g>
      );
    case "night_owl":
      return (
        <g>
          <path d="M60,6 A44,44 0 1 0 94,72 A36,36 0 1 1 60,6 Z" {...f} />
          <path d="M84,14 L87,23 L96,26 L87,29 L84,38 L81,29 L72,26 L81,23 Z" {...f} />
        </g>
      );
    case "century":
    case "page_turner":
      return (
        <g>
          <path d={roundRect(28, 6, 62, 78, 10)} {...f} fillOpacity={0.55} />
          <path d={roundRect(12, 16, 66, 80, 10)} {...f} />
        </g>
      );
    case "goal_getter":
      return (
        <g>
          <circle cx={50} cy={50} r={46} {...f} />
          <circle cx={50} cy={50} r={32} fill={deep} fillOpacity={0.22} />
          <circle cx={50} cy={50} r={22} {...f} />
          <circle cx={50} cy={50} r={9} fill={deep} fillOpacity={0.35} />
        </g>
      );
    case "the_end":
      return (
        <g>
          <path d={roundRect(18, 6, 64, 90, 10)} {...f} />
          <path d="M28,6 V96" stroke={deep} strokeOpacity={0.18} strokeWidth={3} />
          <path d="M54,6 V38 L62,31 L70,38 V6 Z" fill={deep} fillOpacity={0.45} />
        </g>
      );
    case "podium":
      return (
        <g {...line}>
          <path d="M10,90 H90 M16,90 V60 H38 V90 M38,90 V40 H62 V90 M62,90 V68 H84 V90" />
          <path d="M50,10 L54,20 L64,20 L56,26 L59,36 L50,30 L41,36 L44,26 L36,20 L46,20 Z" fill={fill} stroke="none" />
        </g>
      );
    case "top_of_shelf":
      return (
        <g {...line}>
          <path d="M28,14 H72 V36 C72,54 62,64 50,64 C38,64 28,54 28,36 Z M28,22 H14 C14,38 20,46 32,48 M72,22 H86 C86,38 80,46 68,48 M50,64 V80 M32,90 H68" />
        </g>
      );
    case "daily_champion":
      return (
        <g {...line}>
          <path d="M32,6 L45,38 M68,6 L55,38" />
          <circle cx={50} cy={64} r={26} />
          <path d="M50,50 L54,59 L63,59 L56,65 L59,74 L50,68 L41,74 L44,65 L37,59 L46,59 Z" fill={fill} stroke="none" />
        </g>
      );
    case "climber":
      return (
        <g {...line}>
          <path d="M8,90 H30 V70 H52 V50 H74 V30 H94" />
          <path d="M14,58 L56,16 M40,16 H56 V32" />
        </g>
      );
    case "hype_squad":
      return (
        <g>
          <path d="M14,10 H86 A12,12 0 0 1 98,22 V64 A12,12 0 0 1 86,76 H46 L24,96 V76 H14 A12,12 0 0 1 2,64 V22 A12,12 0 0 1 14,10 Z" {...f} />
          <path d="M50,64 C36,53 30,46 30,37 C30,30 35,26 41,26 C45,26 48,28 50,31 C52,28 55,26 59,26 C65,26 70,30 70,37 C70,46 64,53 50,64 Z" fill={deep} fillOpacity={0.55} />
        </g>
      );
  }
}

// ---------------------------------------------------------------------------
// Text helpers (divs, so generated images can draw them too)
// ---------------------------------------------------------------------------

interface TextOpts {
  k: number;
  fontFamily: string;
  color: string;
}

function centred(t: string, top: number, size: number, o: TextOpts, extra: CSSProperties = {}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: top * o.k,
        display: "flex",
        justifyContent: "center",
        fontFamily: o.fontFamily,
        color: o.color,
        fontSize: size * o.k,
        lineHeight: 1,
        ...extra,
      }}
    >
      {t}
    </div>
  );
}

/**
 * Letters along an arc around (cx, cy). Top arcs read left to right over the top; bottom arcs read
 * left to right along the bottom.
 */
function arcText(t: string, cx: number, cy: number, r: number, size: number, spacing: number, side: "top" | "bottom", o: TextOpts, weight = 700) {
  const chars = [...t];
  const step = (size * 0.66 + spacing) / r; // radians per letter
  const span = step * (chars.length - 1);
  return chars.map((ch, i) => {
    const a = -span / 2 + i * step; // left to right in both cases
    const x = cx + r * Math.sin(a);
    const y = side === "top" ? cy - r * Math.cos(a) : cy + r * Math.cos(a);
    const deg = ((side === "top" ? a : -a) * 180) / Math.PI;
    const box = size * 1.2;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: (x - box / 2) * o.k,
          top: (y - box / 2) * o.k,
          width: box * o.k,
          height: box * o.k,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: o.fontFamily,
          color: o.color,
          fontSize: size * o.k,
          fontWeight: weight,
          lineHeight: 1,
          transform: `rotate(${deg.toFixed(2)}deg)`,
          transformOrigin: "50% 50%",
        }}
      >
        {ch === " " ? " " : ch}
      </div>
    );
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "5 Oct · 2026" from a date key. */
export function badgeDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} · ${y}`;
}

// ---------------------------------------------------------------------------

export interface BadgeArtProps {
  id: BadgeId;
  level?: number;
  /** Times earned, shown in the seal on repeatable badges. */
  count?: number;
  locked?: boolean;
  /** Width in px; height is 1.3× the width. */
  size: number;
  /** "inherit" in the app; the loaded font's name in generated images. */
  fontFamily?: string;
  /** When it was earned (challenge date); printed at the bottom. */
  earnedOn?: string | null;
  /** Overrides the bottom label and value, e.g. progress on a locked badge. */
  footer?: { label: string; value: string };
}

export function BadgeArt({ id, level = 1, count = 0, locked = false, size, fontFamily = "inherit", earnedOn = null, footer }: BadgeArtProps) {
  const def = BADGES.find((b) => b.id === id)!;
  const base = id === "efiko" ? THEMES.efiko : THEMES[def.category];
  const theme: Theme = locked ? { ...LOCKED, frame: base.frame } : base;
  const k = size / W;
  const uid = `${id}-${level}-${locked ? "l" : "e"}`;
  const { outer, panel, border } = frameShapes(theme.frame);
  const name = badgeName(id, level);
  const tagline = pick(TAGLINES[id], level) ?? "";
  const numeral = pick(NUMERALS[id], level) ?? "";
  const serial = String(BADGES.indexOf(def) + 1).padStart(2, "0");
  const o: TextOpts = { k, fontFamily, color: theme.text };
  const emblemFill = locked ? "#ffffff" : id === "efiko" ? `url(#gold-${uid})` : `url(#gloss-${uid})`;
  const bottomLabel = footer?.label ?? (locked ? "LOCKED" : earnedOn ? "EARNED" : "STILL READING");
  const bottomValue = footer?.value ?? (earnedOn ? badgeDate(earnedOn) : locked ? "Not yet" : name);
  const year = (earnedOn ?? "").slice(0, 4) || String(new Date().getFullYear());

  const defs = (
    <defs>
      <linearGradient id={`base-${uid}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={theme.stops[0]} />
        <stop offset="0.55" stopColor={theme.stops[1]} />
        <stop offset="1" stopColor={theme.stops[2]} />
      </linearGradient>
      {theme.glows.map(([c], i) => (
        <radialGradient key={i} id={`glow-${uid}-${i}`}>
          <stop offset="0" stopColor={c} stopOpacity={0.85} />
          <stop offset="0.6" stopColor={c} stopOpacity={0.25} />
          <stop offset="1" stopColor={c} stopOpacity={0} />
        </radialGradient>
      ))}
      <linearGradient id={`gloss-${uid}`} x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.6" stopColor="#ffffff" stopOpacity={0.94} />
        <stop offset="1" stopColor="#ffffff" stopOpacity={0.72} />
      </linearGradient>
      <linearGradient id={`gold-${uid}`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stopColor="#fbeab0" />
        <stop offset="0.5" stopColor="#f6dd8b" />
        <stop offset="1" stopColor="#f2a64a" />
      </linearGradient>
      <filter id={`lift-${uid}`} x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#111111" floodOpacity={locked ? 0.06 : 0.28} />
      </filter>
      <filter id={`soft-${uid}`} x="-10%" y="-10%" width="120%" height="125%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#111111" floodOpacity={locked ? 0 : 0.14} />
      </filter>
      <clipPath id={`clip-${uid}`}>
        <path d={panel} />
      </clipPath>
    </defs>
  );

  // Faint guide lines behind the emblem: concentric circles and a crosshair.
  const guides = (cy: number) => (
    <g clipPath={`url(#clip-${uid})`} stroke={theme.frame === "card" ? "#ffffff" : theme.text} strokeOpacity={locked ? 0.35 : theme.frame === "card" ? 0.35 : 0.16} strokeWidth={0.7} fill="none">
      <circle cx={100} cy={cy} r={34} />
      <circle cx={100} cy={cy} r={54} />
      <circle cx={100} cy={cy} r={76} />
      <circle cx={100} cy={cy} r={100} />
      <path d={`M100,0 V${H} M0,${cy} H${W} M20,${cy - 80} L180,${cy + 80} M180,${cy - 80} L20,${cy + 80}`} />
    </g>
  );

  // A few sparkles, like the doodles on the cards.
  const sparkles = locked ? null : (
    <g fill={theme.text} fillOpacity={0.5}>
      {[
        [38, 104, 1.6],
        [160, 96, 1.2],
        [46, 186, 1.2],
        [154, 178, 1.8],
        [132, 80, 1],
        [66, 82, 1],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} />
      ))}
      <path d="M150,124 l1.6,4 l4,1.6 l-4,1.6 l-1.6,4 l-1.6,-4 l-4,-1.6 l4,-1.6 Z" />
      <path d="M50,140 l1.3,3.2 l3.2,1.3 l-3.2,1.3 l-1.3,3.2 l-1.3,-3.2 l-3.2,-1.3 l3.2,-1.3 Z" />
    </g>
  );

  const panelFill = (
    <g>
      <path d={panel} fill={`url(#base-${uid})`} />
      {theme.glows.map(([, cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={`url(#glow-${uid}-${i})`} clipPath={`url(#clip-${uid})`} />
      ))}
    </g>
  );

  const svg = (children: ReactNode) => (
    <svg width={size} height={size * (H / W)} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
      {defs}
      <path d={outer} fill={theme.rim} filter={`url(#soft-${uid})`} stroke={locked ? "#d8d2c7" : "none"} strokeWidth={locked ? 1.2 : 0} strokeDasharray={locked ? "4 4" : undefined} />
      {panelFill}
      {children}
    </svg>
  );

  const placed = (node: ReactNode, cx: number, cy: number, s: number) => (
    <g transform={`translate(${cx - s / 2},${cy - s / 2}) scale(${s / 100})`} filter={`url(#lift-${uid})`}>
      {node}
    </g>
  );

  const countChip =
    count > 1 && !locked ? (
      <div
        style={{
          position: "absolute",
          top: 6 * k,
          right: 4 * k,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 26 * k,
          minWidth: 26 * k,
          padding: `0 ${7 * k}px`,
          borderRadius: 999,
          background: INK,
          color: PAPER,
          fontFamily,
          fontSize: 11 * k,
          fontWeight: 700,
        }}
      >
        {`×${count}`}
      </div>
    ) : null;

  // --- Certification seal (stadium), after the Wix badge ---
  if (theme.frame === "stadium") {
    return (
      <div style={{ position: "relative", display: "flex", width: size, height: size * (H / W) }}>
        {svg(
          <g>
            <path d={border!} fill="none" stroke={theme.text} strokeOpacity={locked ? 0.5 : 0.85} strokeWidth={1.1} />
            {/* the "court" lines under the title */}
            <g stroke={theme.text} strokeOpacity={locked ? 0.5 : 0.8} strokeWidth={1.1} fill="none">
              <path d="M40,150 V178 M160,150 V178 M32,178 H168 M100,178 V238 M82,178 V204 H118 V178" />
              <path d="M58,178 A42,42 0 0 0 142,178" />
            </g>
            <rect x={89} y={74} width={22} height={22} fill={locked ? "#ffffff" : "#ffffff"} filter={`url(#lift-${uid})`} />
            <circle cx={100} cy={85} r={6.5} fill={locked ? theme.deep : `url(#base-${uid})`} />
          </g>,
        )}
        {arcText("STILL READING CERTIFIED", 100, 104, 66, 8.2, 2.1, "top", o, 600)}
        {centred("CHALLENGE EST.", 60, 6, o, { fontWeight: 600, letterSpacing: 1.4 * k })}
        <div style={{ position: "absolute", left: 0, right: 0, top: 78 * k, display: "flex", justifyContent: "center", gap: 34 * k, fontFamily, color: theme.text, fontSize: 13 * k, fontWeight: 600, lineHeight: 1 }}>
          <div style={{ display: "flex" }}>{year.slice(0, 2)}</div>
          <div style={{ display: "flex" }}>{year.slice(2)}</div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 26 * k,
            right: 26 * k,
            top: 106 * k,
            height: 44 * k,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontFamily,
            color: theme.text,
            fontSize: (name.length > 10 ? 19 : 23) * k,
            fontWeight: 800,
            letterSpacing: -0.4 * k,
            lineHeight: 0.98,
          }}
        >
          {name.toUpperCase()}
        </div>
        {arcText(tagline, 100, 152, 82, 7.4, 1.9, "bottom", o, 600)}
        {countChip}
      </div>
    );
  }

  // --- Rounded card with a framed label, after the Apple badge ---
  if (theme.frame === "card") {
    const label = CARD_LABELS[id] ?? "BADGE";
    return (
      <div style={{ position: "relative", display: "flex", width: size, height: size * (H / W) }}>
        {svg(
          <g>
            <path d={border!} fill="none" stroke="#ffffff" strokeOpacity={locked ? 0.7 : 0.95} strokeWidth={1.6} />
            {guides(108)}
            {placed(emblem(id, emblemFill, theme.deep), 100, 106, 78)}
            <rect x={48} y={190} width={104} height={30} rx={3} fill="#ffffff" fillOpacity={locked ? 0.3 : 0.35} stroke="#ffffff" strokeOpacity={0.95} strokeWidth={1.6} />
          </g>,
        )}
        {centred(name, 160, 12.5, o, { fontWeight: 600, letterSpacing: -0.2 * k })}
        {centred(label, 198, 13.5, o, { fontWeight: 600, letterSpacing: 3 * k })}
        {countChip}
      </div>
    );
  }

  // --- Collectible card (ticket, wavy, stamp) ---
  const seal = (
    <g filter={`url(#soft-${uid})`}>
      <path d={wavyPath(78, 2, 44, 44, 3.4)} fill={id === "efiko" && !locked ? INK : "#ffffff"} />
      <circle cx={100} cy={24} r={17} fill="none" stroke={id === "efiko" && !locked ? "#f6dd8b" : theme.deep} strokeOpacity={locked ? 0.3 : 0.35} strokeWidth={0.8} />
    </g>
  );
  const sealColor = locked ? theme.text : id === "efiko" ? "#f6dd8b" : theme.deep;
  const so: TextOpts = { k, fontFamily, color: sealColor };
  return (
    <div style={{ position: "relative", display: "flex", width: size, height: size * (H / W) }}>
      {svg(
        <g>
          {guides(146)}
          {sparkles}
          {placed(emblem(id, emblemFill, theme.deep), 100, 146, 76)}
          {seal}
        </g>,
      )}
      {arcText("STILL", 100, 24, 12.5, 4.4, 1.2, "top", so, 700)}
      {arcText("READING", 100, 24, 12.5, 4.4, 1.0, "bottom", so, 700)}
      {centred(count > 1 && !locked ? `×${count}` : `#${serial}`, 20.5, 8.6, so, { fontWeight: 800 })}
      {centred(name, 58, name.length > 14 ? 13 : 15, o, { fontWeight: 800, letterSpacing: -0.3 * k })}
      {centred(`· ${tagline} ·`, 76, 5.2, o, { fontWeight: 700, letterSpacing: 1.2 * k, opacity: 0.85 })}
      {numeral
        ? centred(numeral, (id === "day_one" ? 154 : id === "the_end" ? 150 : 160) - (numeral.length > 1 ? 10 : 12), numeral.length > 1 ? 20 : 24, { k, fontFamily, color: theme.deep }, { fontWeight: 800, letterSpacing: -1 * k })
        : null}
      {centred(`· ${bottomLabel} ·`, 206, 5, o, { fontWeight: 700, letterSpacing: 1.4 * k, opacity: 0.85 })}
      {centred(bottomValue, 215, 13, o, { fontWeight: 800, letterSpacing: -0.2 * k })}
    </div>
  );
}
