"use client";
import { useMemo, useState } from "react";
import { addDays, dayNumberOf, diffDays, joinedDateFor } from "@/lib/domain/dates";
import { standingsReaders } from "@/lib/domain/history";
import { leaderboardOn } from "@/lib/domain/leaderboard";
import type { DateKey } from "@/lib/domain/types";
import { formatDateKey, n } from "@/lib/format";
import type { ChallengeView } from "@/local/hooks";
import { Field, Input } from "../ui/field";
import { Segmented } from "../ui/segmented";
import { Podium } from "./podium";

type Choice = "today" | "yesterday" | "pick";

const within = (date: DateKey, first: DateKey, last: DateKey) => diffDays(first, date) >= 0 && diffDays(date, last) >= 0;

/**
 * Host only: the leaderboard's top three as it stood at the end of any day of the challenge (today:
 * the live leaderboard), with what each read that day, laid out as a self-contained card (date,
 * challenge name, podium) that reads well as a screenshot in the group chat.
 */
export function DailyTop({ view }: { view: ChallengeView }) {
  const { challenge, today } = view;
  const first = challenge.startDate;
  const last = diffDays(today, challenge.endDate) < 0 ? challenge.endDate : today;
  const yesterday = addDays(today, -1);

  const options: { value: Choice; label: string }[] = [
    ...(within(today, first, last) ? [{ value: "today" as const, label: "Today" }] : []),
    ...(within(yesterday, first, last) ? [{ value: "yesterday" as const, label: "Yesterday" }] : []),
    { value: "pick", label: "Pick a day" },
  ];
  const [choice, setChoice] = useState<Choice>(options[0]!.value);
  const [picked, setPicked] = useState<DateKey>(last);

  const date = choice === "today" ? today : choice === "yesterday" ? yesterday : picked;
  const readers = useMemo(() => standingsReaders(view.members, (p) => joinedDateFor(challenge, p)), [view.members, challenge]);
  const { board, dayPages } = useMemo(() => leaderboardOn(challenge, readers, date), [challenge, readers, date]);
  const isToday = date === today;
  const dayNote = (e: { participantId: string }) => {
    const pages = dayPages.get(e.participantId) ?? 0;
    return pages ? `+${n(pages)} ${isToday ? "today" : "that day"}` : null;
  };

  if (diffDays(first, last) < 0) return null; // Hasn't started yet.

  return (
    <section aria-labelledby="daily-top-title" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="daily-top-title" className="headline text-[22px]">
          Top 3 by day
        </h2>
        <span className="text-sm text-muted">Only you see this</span>
      </div>
      <p className="text-sm text-muted">Pick a day, then take a screenshot to share it with the crew.</p>
      <Segmented label="Which day" value={choice} options={options} onChange={setChoice} />
      {choice === "pick" ? (
        <Field label="Day">
          {(p) => (
            <Input
              {...p}
              type="date"
              min={first}
              max={last}
              value={picked}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d{4}-\d{2}-\d{2}$/.test(v) && within(v, first, last)) setPicked(v);
              }}
            />
          )}
        </Field>
      ) : null}

      <div className="overflow-hidden rounded-[1.75rem] bg-ink text-white" aria-label="Leaderboard on this day">
        <div className="px-4 pt-5 sm:px-6">
          <p className="text-sm font-medium text-white/50">
            Leaderboard · Day {dayNumberOf(challenge, date)} of {challenge.durationDays}
          </p>
          <p className="headline mt-1 text-[28px] leading-tight">{formatDateKey(date, { weekday: "long", month: "long", day: "numeric" })}</p>
          <p className="mt-0.5 truncate text-sm text-white/45">{challenge.name}</p>
        </div>
        {board.some((e) => e.xp > 0) ? (
          // No "you" marker: this card is made to be shared.
          <Podium entries={board} challengeId={challenge.id} myParticipantId={null} showRest={false} note={dayNote} />
        ) : (
          <p className="px-4 py-10 text-center text-white/60 sm:px-6">No check-ins yet by this day.</p>
        )}
        <p className="px-4 pb-4 pt-4 text-xs text-white/35 sm:px-6">
          Still Reading · {isToday ? "Standings so far today" : "Standings at the end of the day"}
        </p>
      </div>
    </section>
  );
}
