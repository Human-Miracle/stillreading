"use client";
import { useState } from "react";
import { possibleDuplicates } from "@/lib/domain/duplicates";
import { pagesRead } from "@/lib/domain/goals";
import { formatDateKey, n } from "@/lib/format";
import { todayInTimezone } from "@/lib/domain/dates";
import type { ChallengeView, MemberView } from "@/local/hooks";
import { mergeParticipants } from "@/local/repo";
import { Button } from "../ui/button";
import { Card, Eyebrow } from "../ui/card";
import { Field, inputClass } from "../ui/field";

interface Summary {
  checkIns: number;
  pages: number;
  books: number;
  lastRead: string | null;
}

function summarise(m: MemberView): Summary {
  return {
    checkIns: m.sessions.length,
    pages: m.sessions.reduce((sum, s) => sum + pagesRead(s), 0),
    books: m.books.length,
    lastRead: m.sessions.reduce<string | null>((last, s) => (!last || s.date > last ? s.date : last), null),
  };
}

const plural = (count: number, word: string) => `${n(count)} ${word}${count === 1 ? "" : "s"}`;

/** The copy to keep: the host, else whoever has read the most, else whoever joined first. */
function keeper(members: readonly MemberView[]): MemberView {
  return [...members].sort(
    (a, b) =>
      Number(b.participant.role === "host") - Number(a.participant.role === "host") ||
      summarise(b).pages - summarise(a).pages ||
      summarise(b).checkIns - summarise(a).checkIns ||
      a.participant.joinedAt.localeCompare(b.participant.joinedAt),
  )[0]!;
}

/**
 * Host only: find members who joined twice and merge the copies. Everything the duplicate logged
 * (check-ins, books, replies, reactions) moves to the copy being kept, then the duplicate is removed.
 */
export function DuplicateMembers({ view }: { view: ChallengeView }) {
  const { challenge, members } = view;
  const [fromId, setFromId] = useState("");
  const [intoId, setIntoId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [merged, setMerged] = useState<string | null>(null);

  const byId = new Map(members.map((m) => [m.participant.id, m]));
  const groups = possibleDuplicates(members.map((m) => ({ id: m.participant.id, displayName: m.participant.displayName }))).map((g) =>
    g.map((x) => byId.get(x.id)!),
  );
  const from = byId.get(fromId);
  const into = byId.get(intoId);
  const joined = (m: MemberView) => formatDateKey(todayInTimezone(challenge.timezone, new Date(m.participant.joinedAt)));
  const describe = (m: MemberView) => {
    const s = summarise(m);
    return [`Joined ${joined(m)}`, plural(s.checkIns, "check-in"), `${plural(s.pages, "page")}`, s.lastRead ? `last read ${formatDateKey(s.lastRead)}` : null]
      .filter(Boolean)
      .join(" · ");
  };
  const pick = (f: string, i: string) => {
    setFromId(f);
    setIntoId(i);
    setConfirming(false);
    setMerged(null);
  };

  return (
    <Card className="space-y-4" aria-labelledby="duplicates-title">
      <Eyebrow id="duplicates-title">Duplicate members</Eyebrow>
      <p className="text-ink-2">
        Someone who opened the invite in two places (another browser, or Safari and the Home Screen app) joins twice. Merge the copies: their check-ins, books and
        replies move to the one you keep, and the other is removed.
      </p>

      {groups.length ? (
        <ul className="space-y-3" aria-label="Possible duplicates">
          {groups.map((g) => {
            const keep = keeper(g);
            return (
              <li key={keep.participant.id} className="space-y-2 rounded-2xl bg-surface-2 p-3">
                <p className="text-sm font-medium">Similar names: {g.map((m) => m.participant.displayName).join(" / ")}</p>
                <ul className="space-y-1.5">
                  {g.map((m) => (
                    <li key={m.participant.id} className="text-sm">
                      <span className="font-medium">{m.participant.displayName}</span>
                      {m.participant.role === "host" ? <span className="text-muted"> (host)</span> : null}
                      <span className="block text-muted">{describe(m)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {g
                    .filter((m) => m !== keep)
                    .map((m) => (
                      <Button key={m.participant.id} size="sm" variant="secondary" onClick={() => pick(m.participant.id, keep.participant.id)}>
                        Merge {m.participant.displayName} → {keep.participant.displayName}
                      </Button>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">No likely duplicates: nobody shares a first name. If a name is spelt differently, pick the two below.</p>
      )}

      <div className="space-y-3 border-t border-line pt-4">
        <Field label="Duplicate to remove">
          {(p) => (
            <select {...p} className={inputClass} value={fromId} onChange={(e) => pick(e.target.value, intoId === e.target.value ? "" : intoId)}>
              <option value="">Choose a member</option>
              {members
                .filter((m) => m.participant.role !== "host")
                .map((m) => (
                  <option key={m.participant.id} value={m.participant.id}>
                    {m.participant.displayName} · {plural(summarise(m).pages, "page")}
                  </option>
                ))}
            </select>
          )}
        </Field>
        <Field label="Keep">
          {(p) => (
            <select {...p} className={inputClass} value={intoId} onChange={(e) => pick(fromId, e.target.value)}>
              <option value="">Choose a member</option>
              {members
                .filter((m) => m.participant.id !== fromId)
                .map((m) => (
                  <option key={m.participant.id} value={m.participant.id}>
                    {m.participant.displayName} · {plural(summarise(m).pages, "page")}
                  </option>
                ))}
            </select>
          )}
        </Field>

        {from && into ? (
          <p className="text-sm text-ink-2" role="status">
            Moves {plural(summarise(from).checkIns, "check-in")} ({plural(summarise(from).pages, "page")}) and {plural(summarise(from).books, "book")} from{" "}
            <span className="font-medium">{from.participant.displayName}</span> to <span className="font-medium">{into.participant.displayName}</span>, then
            removes {from.participant.displayName}.
          </p>
        ) : null}

        {confirming && from && into ? (
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={async () => {
                await mergeParticipants(challenge.id, from.participant.id, into.participant.id);
                setMerged(`Merged ${from.participant.displayName} into ${into.participant.displayName}.`);
                setFromId("");
                setIntoId("");
                setConfirming(false);
              }}
            >
              Yes, merge
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="secondary" disabled={!from || !into} onClick={() => setConfirming(true)}>
            Merge
          </Button>
        )}
        {merged ? (
          <p className="text-sm font-medium text-good" role="status">
            {merged} Their reading shows up after the next sync.
          </p>
        ) : null}
        <p className="text-sm text-muted">
          Keep the copy on the phone they use now. If they end up on the other phone, use Re-invite on the copy you kept to move them there.
        </p>
      </div>
    </Card>
  );
}
