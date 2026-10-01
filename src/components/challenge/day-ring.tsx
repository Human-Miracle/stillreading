import type { ReactNode } from "react";
import type { ParticipantProgress } from "@/lib/domain/progress";

export type DayState = "before" | "future" | "today" | "met" | "read" | "missed";

const WEEK_COLORS = ["var(--butter)", "var(--sage)", "var(--blush)", "var(--lavender)", "var(--sky)"];
const MUTED = { missed: "#e2dccf", future: "#ece7dd" } as const;

interface Run {
  start: number;
  end: number; // inclusive day index
  state: DayState;
  week: number;
}

export function dayStates(progress: ParticipantProgress, durationDays: number): DayState[] {
  const offset = durationDays - progress.effectiveDuration;
  const today = progress.clock.phase === "active" ? progress.clock.today : null;
  return Array.from({ length: durationDays }, (_, i) => {
    if (i < offset) return "before";
    const d = progress.days[i - offset];
    if (!d) return "future";
    if (d.goalMet) return "met";
    if (d.read) return "read";
    return d.date === today ? "today" : "missed";
  });
}

function buildRuns(states: DayState[]): Run[] {
  const runs: Run[] = [];
  states.forEach((state, i) => {
    const week = Math.floor(i / 7);
    const last = runs[runs.length - 1];
    // Same state within the same week merges into one chunky segment, like the reference ring.
    const mergeable = state !== "today" && last && last.state === state && (state === "future" || state === "before" || last.week === week);
    if (mergeable) last.end = i;
    else runs.push({ start: i, end: i, state, week });
  });
  return runs;
}

function colorFor(run: Run) {
  switch (run.state) {
    case "met":
      return { stroke: WEEK_COLORS[run.week % WEEK_COLORS.length]!, opacity: 1 };
    case "read":
      return { stroke: WEEK_COLORS[run.week % WEEK_COLORS.length]!, opacity: 0.45 };
    case "missed":
      return { stroke: MUTED.missed, opacity: 1 };
    case "before":
      return { stroke: MUTED.future, opacity: 0.3 };
    default:
      return { stroke: MUTED.future, opacity: 1 };
  }
}

/**
 * Segmented ring of challenge days (reference: the pastel health-score ring).
 * Goal days are full pastel, partial days soft, missed days stone, future days faint.
 * The red dot marks today.
 */
export function DayRing({
  progress,
  durationDays,
  size = 300,
  children,
}: {
  progress: ParticipantProgress;
  durationDays: number;
  size?: number;
  children?: ReactNode;
}) {
  const states = dayStates(progress, durationDays);
  const todayIndex = states.indexOf("today") >= 0 ? states.indexOf("today") : progress.clock.phase === "active" ? progress.clock.dayNumber - 1 : -1;
  const met = states.filter((s) => s === "met").length;
  const read = states.filter((s) => s === "read").length;
  const label = `Day ${progress.clock.dayNumber} of ${durationDays}: ${met} goal day${met === 1 ? "" : "s"}${read ? `, ${read} partial` : ""}`;
  return (
    <SegmentRing states={states} size={size} todayIndex={todayIndex} label={label}>
      {children}
    </SegmentRing>
  );
}

export function SegmentRing({
  states,
  size,
  todayIndex,
  label,
  children,
}: {
  states: DayState[];
  size: number;
  todayIndex: number;
  label: string | null;
  children?: ReactNode;
}) {
  const durationDays = states.length;
  const runs = buildRuns(states);
  const c = size / 2;
  const r = size * 0.4;
  const perDay = (2 * Math.PI * r) / durationDays;
  const stroke = Math.max(12, Math.min(size * 0.115, perDay * 0.78));
  const gap = Math.max(3, stroke * 0.22);
  const toXY = (len: number) => {
    const a = len / r - Math.PI / 2;
    return [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
  };

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
        {runs.map((run, i) => {
          const from = run.start * perDay + (stroke + gap) / 2;
          const to = (run.end + 1) * perDay - (stroke + gap) / 2;
          const { stroke: color, opacity } = colorFor(run);
          const style = { animationDelay: `${Math.min(i, 16) * 45}ms`, opacity };
          if (to - from <= 0.5) {
            const [x, y] = toXY((run.start + (run.end - run.start + 1) / 2) * perDay);
            return <circle key={i} cx={x} cy={y} r={stroke / 2} fill={color} className="animate-fade" style={style} />;
          }
          const [x1, y1] = toXY(from);
          const [x2, y2] = toXY(to);
          const large = (to - from) / r > Math.PI ? 1 : 0;
          return (
            <path
              key={i}
              d={`M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              className="animate-fade"
              style={style}
            />
          );
        })}
        {todayIndex >= 0 ? (
          (() => {
            const [x, y] = toXY((todayIndex + 0.5) * perDay);
            return <circle cx={x} cy={y} r={Math.max(4, stroke * 0.2)} fill="var(--signal)" stroke="white" strokeWidth="2" />;
          })()
        ) : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
