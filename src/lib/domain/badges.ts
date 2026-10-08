import { addDays, diffDays, joinedDateFor, todayInTimezone } from "./dates";
import { readerStart } from "./day-one";
import { isLive, pagesRead } from "./goals";
import type { StandingsReader } from "./history";
import { leaderboardOn } from "./leaderboard";
import { participantProgress } from "./progress";
import type { ChallengeLike, DateKey, SessionLike } from "./types";

/**
 * Badges: milestones a reader earns in a challenge, worked out from the challenge's data (check-ins,
 * books, reactions, replies and the day-by-day leaderboard). Everyone's badges come from the same
 * data, so every member sees the same result, and the server can check a badge before sharing it.
 */

export type BadgeId =
  | "first_page"
  | "day_one"
  | "hat_trick"
  | "week_warrior"
  | "fortnight_focus"
  | "efiko"
  | "comeback"
  | "weekend_reader"
  | "early_bird"
  | "dawn_reader"
  | "night_owl"
  | "century"
  | "page_turner"
  | "goal_getter"
  | "the_end"
  | "podium"
  | "top_of_shelf"
  | "daily_champion"
  | "climber"
  | "hype_squad"
  | "time_traveller";

export type BadgeCategory = "start" | "streak" | "time" | "volume" | "leaderboard" | "crew";
export type BadgeTier = "common" | "uncommon" | "rare" | "epic" | "efiko";

export interface BadgeLevel {
  name: string;
  target: number;
  tier: BadgeTier;
}

export interface BadgeDef {
  id: BadgeId;
  category: BadgeCategory;
  /** How to earn it, in a few words. */
  how: string;
  /** Can be earned again; the count shows on the badge (e.g. Early Bird ×4). */
  repeatable?: boolean;
  /** One or more levels. Single-level badges have exactly one. */
  levels: BadgeLevel[];
}

const one = (name: string, tier: BadgeTier, target = 1): BadgeLevel[] => [{ name, tier, target }];

export const BADGES: readonly BadgeDef[] = [
  { id: "first_page", category: "start", how: "Log your first reading", levels: one("First Page", "common") },
  { id: "day_one", category: "start", how: "Read on the challenge's first day", levels: one("Day One", "rare") },
  { id: "hat_trick", category: "streak", how: "Read 3 days in a row", levels: one("Hat Trick", "common", 3) },
  { id: "week_warrior", category: "streak", how: "Read 7 days in a row", levels: one("Week Warrior", "uncommon", 7) },
  { id: "fortnight_focus", category: "streak", how: "Read 14 days in a row", levels: one("Fortnight Focus", "rare", 14) },
  { id: "efiko", category: "streak", how: "Read every single day of the challenge", levels: one("Efiko", "efiko") },
  { id: "comeback", category: "streak", how: "Miss 2+ days, then read 3 days in a row", levels: one("Comeback", "uncommon", 3) },
  { id: "weekend_reader", category: "streak", how: "Read on a Saturday and the Sunday after", repeatable: true, levels: one("Weekend Reader", "common") },
  { id: "early_bird", category: "time", how: "Be the first in the crew to log that day", repeatable: true, levels: one("Early Bird", "uncommon") },
  { id: "dawn_reader", category: "time", how: "Log your reading before 7am", repeatable: true, levels: one("Dawn Reader", "common") },
  { id: "night_owl", category: "time", how: "Log your reading between 10pm and 4am", repeatable: true, levels: one("Night Owl", "common") },
  { id: "century", category: "volume", how: "Read 100 pages in one day", repeatable: true, levels: one("Century", "rare", 100) },
  {
    id: "page_turner",
    category: "volume",
    how: "Read 250, 500, 1,000 and 2,500 pages",
    levels: [
      { name: "250 Pages", target: 250, tier: "common" },
      { name: "500 Club", target: 500, tier: "uncommon" },
      { name: "1K Pages", target: 1000, tier: "rare" },
      { name: "2.5K Pages", target: 2500, tier: "epic" },
    ],
  },
  { id: "goal_getter", category: "volume", how: "Hit your daily goal 7 times", levels: one("Goal Getter", "uncommon", 7) },
  {
    id: "the_end",
    category: "volume",
    how: "Finish a book, then three",
    levels: [
      { name: "The End", target: 1, tier: "uncommon" },
      { name: "Bookworm", target: 3, tier: "rare" },
    ],
  },
  { id: "podium", category: "leaderboard", how: "Finish a day in the top 3", repeatable: true, levels: one("Podium", "rare") },
  { id: "top_of_shelf", category: "leaderboard", how: "Finish a day at #1", repeatable: true, levels: one("Top of the Shelf", "epic") },
  { id: "daily_champion", category: "leaderboard", how: "Read the most pages in the crew in a day", repeatable: true, levels: one("Daily Champion", "uncommon") },
  { id: "climber", category: "leaderboard", how: "Climb 5+ places on the leaderboard in a day", repeatable: true, levels: one("Climber", "uncommon", 5) },
  { id: "hype_squad", category: "crew", how: "Cheer or reply on 25 crew check-ins", levels: one("Hype Squad", "uncommon", 25) },
  { id: "time_traveller", category: "streak", how: "Bring back a missed day with a Time Stone", repeatable: true, levels: one("Time Traveller", "uncommon") },
];

export const BADGE_BY_ID = new Map(BADGES.map((b) => [b.id, b]));

export interface BadgeResult {
  id: BadgeId;
  /** Highest level reached; 0 = not earned yet. */
  level: number;
  /** When the current level was first reached (challenge timezone). */
  earnedOn: DateKey | null;
  /** Times earned, for repeatable badges (1 once earned otherwise). */
  count: number;
  /** Towards the next level (or the first), when that can be measured. */
  progress: { current: number; target: number } | null;
  /** Can't be earned any more in this challenge (e.g. Efiko after a missed day). */
  closed: boolean;
  /** A short line for the badge card, e.g. "7 days in a row". */
  stat: string | null;
}

/** Identifies one earned badge level: what's shown once, and what gets shared. */
export const badgeKey = (r: Pick<BadgeResult, "id" | "level">) => `${r.id}:${r.level}`;

export function badgeName(id: BadgeId, level: number): string {
  const def = BADGE_BY_ID.get(id)!;
  return def.levels[Math.max(0, Math.min(def.levels.length, level) - 1)]!.name;
}

export function badgeTier(id: BadgeId, level: number): BadgeTier {
  const def = BADGE_BY_ID.get(id)!;
  return def.levels[Math.max(0, Math.min(def.levels.length, level) - 1)]!.tier;
}

export interface BadgeSession extends SessionLike {
  id: string;
  createdAt: string;
  /** Logged for a missed day with a Time Stone. */
  timeStone?: boolean | null;
}

export interface BadgeReader extends StandingsReader {
  sessions: readonly BadgeSession[];
}

export interface BadgeInput {
  challenge: ChallengeLike;
  today: DateKey;
  readers: readonly BadgeReader[];
  reactions: readonly { participantId: string; sessionId: string; createdAt: string; deletedAt?: string | null }[];
  replies: readonly { participantId: string; sessionId: string; createdAt: string; deletedAt?: string | null }[];
}

const fmt = (v: number) => v.toLocaleString("en-US");
const plural = (v: number, word: string) => `${fmt(v)} ${word}${v === 1 ? "" : "s"}`;

function hourIn(timezone: string, iso: string): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  return Number.parseInt(h, 10);
}

/** Runs of consecutive dates: the date each run first reached `n` days. */
function firstRunOf(dates: readonly DateKey[], n: number): DateKey | null {
  let run = 0;
  let prev: DateKey | null = null;
  for (const d of dates) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
    prev = d;
    if (run >= n) return d;
  }
  return null;
}

function currentRun(dates: ReadonlySet<DateKey>, today: DateKey): number {
  // Today still counts as in progress: a run that ended yesterday is still alive.
  let d = dates.has(today) ? today : addDays(today, -1);
  let run = 0;
  while (dates.has(d)) {
    run += 1;
    d = addDays(d, -1);
  }
  return run;
}

/** Everyone's badges, by participant id. */
export function computeBadges(input: BadgeInput): Map<string, BadgeResult[]> {
  const { challenge, today, readers } = input;
  const tz = challenge.timezone;
  const lastDay = diffDays(today, challenge.endDate) < 0 ? challenge.endDate : today;
  // The last day that is over: leaderboard badges are decided at the end of a day.
  const lastFinished = diffDays(today, challenge.endDate) < 0 ? challenge.endDate : addDays(today, -1);
  const inChallenge = (d: DateKey) => diffDays(challenge.startDate, d) >= 0 && diffDays(d, lastDay) >= 0;
  const localDate = (iso: string) => todayInTimezone(tz, new Date(iso));

  const live = new Map(readers.map((r) => [r.participantId, r.sessions.filter((s) => isLive(s) && s.amount > 0 && inChallenge(s.date))]));
  const owner = new Map<string, string>();
  for (const r of readers) for (const s of r.sessions) owner.set(s.id, r.participantId);
  const dayPages = new Map<string, Map<DateKey, number>>();
  for (const r of readers) {
    const m = new Map<DateKey, number>();
    for (const s of live.get(r.participantId)!) m.set(s.date, (m.get(s.date) ?? 0) + pagesRead(s));
    dayPages.set(r.participantId, m);
  }

  // Early Bird: the first check-in made on the day it's for (a backfill can't win).
  const earliest = new Map<DateKey, { pid: string; at: string }>();
  for (const r of readers) {
    for (const s of live.get(r.participantId)!) {
      if (localDate(s.createdAt) !== s.date) continue;
      const cur = earliest.get(s.date);
      if (!cur || s.createdAt < cur.at) earliest.set(s.date, { pid: r.participantId, at: s.createdAt });
    }
  }

  // The leaderboard at the end of every finished day, and each day's top page count.
  const ranks = new Map<DateKey, Map<string, number>>();
  const champions = new Map<DateKey, { pids: Set<string>; pages: number }>();
  if (diffDays(challenge.startDate, lastFinished) >= 0) {
    for (let d = challenge.startDate; diffDays(d, lastFinished) >= 0; d = addDays(d, 1)) {
      const { board } = leaderboardOn(challenge, readers, d);
      ranks.set(d, new Map(board.filter((e) => e.xp > 0).map((e) => [e.participantId, e.rank])));
      let best = 0;
      for (const r of readers) best = Math.max(best, dayPages.get(r.participantId)!.get(d) ?? 0);
      if (best > 0) champions.set(d, { pages: best, pids: new Set(readers.filter((r) => (dayPages.get(r.participantId)!.get(d) ?? 0) === best).map((r) => r.participantId)) });
    }
  }
  const dayNo = (d: DateKey) => diffDays(challenge.startDate, d) + 1;

  const out = new Map<string, BadgeResult[]>();
  for (const r of readers) {
    const pid = r.participantId;
    const sessions = [...live.get(pid)!].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const readDates = [...new Set(sessions.map((s) => s.date))].sort();
    const readSet = new Set(readDates);
    const pages = dayPages.get(pid)!;
    const start = readerStart(challenge, r.joinedDate, sessions);
    const results: BadgeResult[] = [];
    const add = (id: BadgeId, partial: Partial<BadgeResult>) =>
      results.push({ id, level: 0, earnedOn: null, count: 0, progress: null, closed: false, stat: null, ...partial });
    const once = (on: DateKey | null) => (on ? { level: 1, earnedOn: on, count: 1 } : {});

    // Getting started
    add("first_page", { ...once(readDates[0] ?? null), stat: sessions[0] ? `Day ${dayNo(sessions[0].date)} · ${plural(pagesRead(sessions[0]), "page")}` : null });
    const dayOne = readSet.has(challenge.startDate) ? challenge.startDate : null;
    add("day_one", { ...once(dayOne), closed: !dayOne && diffDays(challenge.startDate, today) > 0, stat: dayOne ? `Read on day 1 of ${challenge.durationDays}` : null });

    // Streaks
    const now = currentRun(readSet, lastDay);
    for (const [id, n] of [
      ["hat_trick", 3],
      ["week_warrior", 7],
      ["fortnight_focus", 14],
    ] as const) {
      const on = firstRunOf(readDates, n);
      add(id, { ...once(on), progress: on ? null : { current: Math.min(now, n), target: n }, stat: on ? `${n} days in a row` : null });
    }

    // Efiko: every day from the reader's first challenge day to the last.
    const range = diffDays(start, challenge.endDate) + 1;
    let missed = false;
    for (let d = start; diffDays(d, lastFinished) >= 0 && diffDays(d, challenge.endDate) >= 0; d = addDays(d, 1)) {
      if (!readSet.has(d)) {
        missed = true;
        break;
      }
    }
    const allDone = !missed && diffDays(challenge.endDate, today) >= 0 && readSet.has(challenge.endDate);
    const soFar = missed ? 0 : readDates.filter((d) => diffDays(start, d) >= 0).length;
    add("efiko", { ...once(allDone ? challenge.endDate : null), closed: missed, progress: allDone || missed ? null : { current: soFar, target: range }, stat: allDone ? `Read all ${range} days` : null });

    // Comeback: a gap of 2+ missed days after reading, then 3 days in a row.
    let comeback: DateKey | null = null;
    {
      let readBefore = false;
      let gap = 0;
      let run = 0;
      let armed = false;
      for (let d = start; diffDays(d, lastDay) >= 0 && !comeback; d = addDays(d, 1)) {
        if (readSet.has(d)) {
          if (readBefore && gap >= 2) {
            armed = true;
            run = 0;
          }
          gap = 0;
          readBefore = true;
          if (armed && ++run >= 3) comeback = d;
        } else {
          gap += 1;
          armed = false; // A miss breaks the comeback run; a new 2-day gap can start another.
          run = 0;
        }
      }
    }
    add("comeback", { ...once(comeback), stat: comeback ? "Back for 3 days straight" : null });

    // Time Traveller: a missed day brought back with a Time Stone, once per day restored.
    const restored = sessions.filter((s) => s.timeStone).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const restoredDays = new Set(restored.map((s) => s.date));
    add("time_traveller", {
      level: restored.length ? 1 : 0,
      earnedOn: restored[0] ? localDate(restored[0].createdAt) : null,
      count: restoredDays.size,
      stat: restored[0] ? (restoredDays.size === 1 ? `Brought back day ${dayNo(restored[0].date)}` : `${restoredDays.size} missed days brought back`) : null,
    });

    // Weekend Reader: Saturday and the Sunday after.
    const weekends = readDates.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6 && readSet.has(addDays(d, 1)));
    add("weekend_reader", { level: weekends.length ? 1 : 0, earnedOn: weekends[0] ? addDays(weekends[0], 1) : null, count: weekends.length, stat: weekends.length ? plural(weekends.length, "weekend") : null });

    // Time of day
    const early = [...earliest.entries()].filter(([, v]) => v.pid === pid).map(([d]) => d).sort();
    add("early_bird", { level: early.length ? 1 : 0, earnedOn: early[0] ?? null, count: early.length, stat: early.length ? `First to log, ${early.length}×` : null });
    const dawn = sessions.filter((s) => localDate(s.createdAt) === s.date && hourIn(tz, s.createdAt) >= 4 && hourIn(tz, s.createdAt) < 7);
    add("dawn_reader", { level: dawn.length ? 1 : 0, earnedOn: dawn[0]?.date ?? null, count: new Set(dawn.map((s) => s.date)).size, stat: dawn.length ? "Logged before 7am" : null });
    const owl = sessions.filter((s) => {
      const h = hourIn(tz, s.createdAt);
      const logged = localDate(s.createdAt);
      return (h >= 22 || h < 4) && (s.date === logged || s.date === addDays(logged, -1));
    });
    add("night_owl", { level: owl.length ? 1 : 0, earnedOn: owl[0]?.date ?? null, count: new Set(owl.map((s) => s.date)).size, stat: owl.length ? "Logged after 10pm" : null });

    // Volume
    const bigDays = readDates.filter((d) => (pages.get(d) ?? 0) >= 100);
    const bestDay = Math.max(0, ...pages.values());
    add("century", {
      level: bigDays.length ? 1 : 0,
      earnedOn: bigDays[0] ?? null,
      count: bigDays.length,
      progress: bigDays.length ? null : { current: Math.min(bestDay, 100), target: 100 },
      stat: bigDays.length ? `${fmt(bestDay)} pages in a day` : null,
    });

    const turner = BADGE_BY_ID.get("page_turner")!.levels;
    let total = 0;
    let level = 0;
    let levelOn: DateKey | null = null;
    for (const d of readDates) {
      total += pages.get(d) ?? 0;
      while (level < turner.length && total >= turner[level]!.target) {
        level += 1;
        levelOn = d;
      }
    }
    const nextTurner = turner[level];
    add("page_turner", { level, earnedOn: levelOn, count: level ? 1 : 0, progress: nextTurner ? { current: total, target: nextTurner.target } : null, stat: level ? `${fmt(total)} pages read` : null });

    const progress = participantProgress({ challenge, goal: r.goal, sessions: r.sessions, books: r.books, today, joinedDate: r.joinedDate });
    const goalDays = progress.days.filter((d) => d.goalMet).map((d) => d.date);
    add("goal_getter", { ...once(goalDays[6] ?? null), progress: goalDays.length >= 7 ? null : { current: goalDays.length, target: 7 }, stat: goalDays.length >= 7 ? plural(goalDays.length, "goal day") : null });

    const finished = r.books
      .filter((b) => isLive(b) && b.status === "completed")
      .map((b) => (b.completedAt ? localDate(b.completedAt) : today))
      .sort();
    const theEnd = finished.length >= 3 ? 2 : finished.length >= 1 ? 1 : 0;
    add("the_end", {
      level: theEnd,
      earnedOn: theEnd === 2 ? finished[2]! : theEnd === 1 ? finished[0]! : null,
      count: theEnd ? 1 : 0,
      progress: theEnd < 2 ? { current: finished.length, target: theEnd ? 3 : 1 } : null,
      stat: finished.length ? `${plural(finished.length, "book")} finished` : null,
    });

    // Leaderboard
    const podium: DateKey[] = [];
    const top: DateKey[] = [];
    const climbs: { d: DateKey; by: number }[] = [];
    let prevRank: number | undefined;
    for (const [d, m] of ranks) {
      const rank = m.get(pid);
      if (rank !== undefined && rank <= 3) podium.push(d);
      if (rank === 1) top.push(d);
      if (rank !== undefined && prevRank !== undefined && prevRank - rank >= 5) climbs.push({ d, by: prevRank - rank });
      prevRank = rank;
    }
    add("podium", { level: podium.length ? 1 : 0, earnedOn: podium[0] ?? null, count: podium.length, stat: podium.length ? `Top 3 on day ${dayNo(podium[0]!)}` : null });
    add("top_of_shelf", { level: top.length ? 1 : 0, earnedOn: top[0] ?? null, count: top.length, stat: top.length ? `#1 on day ${dayNo(top[0]!)}` : null });
    const champ = [...champions.entries()].filter(([, v]) => v.pids.has(pid));
    add("daily_champion", {
      level: champ.length ? 1 : 0,
      earnedOn: champ[0]?.[0] ?? null,
      count: champ.length,
      stat: champ.length ? `Most pages on day ${dayNo(champ[0]![0])} · ${fmt(champ[0]![1].pages)}` : null,
    });
    const bestClimb = climbs.reduce((m, c) => Math.max(m, c.by), 0);
    add("climber", { level: climbs.length ? 1 : 0, earnedOn: climbs[0]?.d ?? null, count: climbs.length, stat: climbs.length ? `Up ${bestClimb} places in a day` : null });

    // Crew
    const cheers = [...input.reactions, ...input.replies]
      .filter((x) => x.participantId === pid && isLive(x) && owner.get(x.sessionId) !== undefined && owner.get(x.sessionId) !== pid)
      .map((x) => x.createdAt)
      .sort();
    add("hype_squad", { ...once(cheers[24] ? localDate(cheers[24]) : null), progress: cheers.length >= 25 ? null : { current: cheers.length, target: 25 }, stat: cheers.length >= 25 ? `${fmt(cheers.length)} cheers for the crew` : null });

    out.set(pid, results);
  }
  return out;
}

/** How many readers have reached this badge level, out of how many. */
export function badgeRarity(all: Map<string, BadgeResult[]>, id: BadgeId, level: number): { holders: number; readers: number } {
  let holders = 0;
  for (const results of all.values()) if ((results.find((r) => r.id === id)?.level ?? 0) >= level && level > 0) holders += 1;
  return { holders, readers: all.size };
}

/** Builds the badge input from members as the app and the server both hold them. */
export function badgeInputFrom(args: {
  challenge: ChallengeLike;
  today: DateKey;
  members: readonly {
    participant: { id: string; displayName: string; role: string; joinedAt: string };
    goal: BadgeReader["goal"];
    sessions: readonly BadgeSession[];
    books: BadgeReader["books"];
  }[];
  reactions: BadgeInput["reactions"];
  replies: BadgeInput["replies"];
}): BadgeInput {
  return {
    challenge: args.challenge,
    today: args.today,
    readers: args.members.map((m) => ({
      participantId: m.participant.id,
      displayName: m.participant.displayName,
      goal: m.goal,
      sessions: m.sessions,
      books: m.books,
      joinedDate: joinedDateFor(args.challenge, m.participant),
    })),
    reactions: args.reactions,
    replies: args.replies,
  };
}
