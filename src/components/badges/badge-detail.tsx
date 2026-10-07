"use client";
import { useEffect, useState } from "react";
import { BADGE_BY_ID, badgeName, type BadgeResult } from "@/lib/domain/badges";
import { diffDays } from "@/lib/domain/dates";
import { formatDateKey } from "@/lib/format";
import { ApiClientError } from "@/local/api";
import { prepareBadgeShare, type PreparedShare } from "@/local/badges";
import { getSyncEngine } from "@/local/sync/engine";
import { isIos } from "../pwa/install-state";
import { Button } from "../ui/button";
import { Segmented } from "../ui/segmented";
import { BadgeArt } from "./badge-art";

type Format = "story" | "square";

function rarityText(r: { holders: number; readers: number }): string | null {
  if (r.readers < 2 || r.holders < 1) return null;
  if (r.holders === 1) return `The only one of ${r.readers} readers with this`;
  return `${r.holders} of ${r.readers} readers have this`;
}

function lockedText(r: BadgeResult): string {
  if (r.closed) return r.id === "efiko" ? "A day was missed, so this one is out of reach in this challenge." : "This one could only be earned on day 1.";
  if (r.progress) return `${r.progress.current.toLocaleString("en-US")} of ${r.progress.target.toLocaleString("en-US")} so far`;
  return "Not earned yet";
}

/** The bottom line on a locked badge: progress, or that it's out of reach. */
export function lockedFooter(r: BadgeResult): { label: string; value: string } {
  if (r.closed) return { label: "LOCKED", value: "Out of reach" };
  if (r.progress) return { label: "PROGRESS", value: `${r.progress.current.toLocaleString("en-US")} of ${r.progress.target.toLocaleString("en-US")}` };
  return { label: "LOCKED", value: "Not yet" };
}

/** A badge's art, what it's for and how far along you are. */
export function BadgeDetail({
  result,
  rarity,
  durationDays,
  startDate,
  owner,
  ownerName,
}: {
  result: BadgeResult;
  rarity: { holders: number; readers: number };
  durationDays: number;
  startDate: string;
  /** Whose badge: "you" or a name. */
  owner: string;
  /** Their display name, printed on the badge. */
  ownerName?: string | null;
}) {
  const def = BADGE_BY_ID.get(result.id)!;
  const earned = result.level > 0;
  const level = Math.max(1, result.level);
  const next = def.levels[result.level];
  const rare = earned ? rarityText(rarity) : null;
  const day = result.earnedOn ? diffDays(startDate, result.earnedOn) + 1 : null;
  return (
    <div className="flex flex-col items-center text-center">
      <div className={earned ? "animate-pop" : undefined}>
        <BadgeArt id={result.id} level={level} count={result.count} locked={!earned} size={190} earnedOn={result.earnedOn} footer={earned ? undefined : lockedFooter(result)} owner={ownerName} />
      </div>
      <p className="mt-5 text-sm text-muted">{earned ? (owner === "you" ? "You earned" : `${owner} earned`) : "Locked"}</p>
      <h3 className="display mt-1 text-[40px] leading-none">{badgeName(result.id, level)}</h3>
      <p className="mt-3 text-ink/70">{def.how}.</p>
      {earned && result.stat ? <p className="mt-1 font-medium">{result.stat}</p> : null}
      {earned && result.earnedOn ? (
        <p className="mt-1 text-sm text-muted">
          {formatDateKey(result.earnedOn, { month: "short", day: "numeric" })}
          {day && day >= 1 && day <= durationDays ? ` · Day ${day} of ${durationDays}` : ""}
          {result.count > 1 ? ` · ${result.count}×` : ""}
        </p>
      ) : null}
      {!earned ? <p className="mt-2 text-sm text-muted">{lockedText(result)}</p> : null}
      {earned && next ? (
        <p className="mt-2 text-sm text-muted">
          Next: {next.name}
          {result.progress ? ` · ${result.progress.current.toLocaleString("en-US")} of ${result.progress.target.toLocaleString("en-US")}` : ""}
        </p>
      ) : null}
      {rare ? <p className="mt-4 rounded-pill bg-butter px-4 py-1.5 text-sm font-medium">{rare}</p> : null}
    </div>
  );
}

/**
 * Save or share my badge's card. The card is prepared (privately) as soon as this shows, so tapping
 * Share can open the phone's share sheet straight away (Safari only allows it right after a tap).
 * Sharing also makes the badge's page public, with a link preview, which the note below says.
 */
export function BadgeShareActions({ challengeId, result }: { challengeId: string; result: BadgeResult }) {
  const [format, setFormat] = useState<Format>("story");
  const [prepared, setPrepared] = useState<PreparedShare | null>(null);
  const [files, setFiles] = useState<Partial<Record<Format, File>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const name = badgeName(result.id, result.level);

  useEffect(() => {
    let live = true;
    void (async () => {
      // The badge may come from reading that hasn't reached the server yet: sync, then ask again.
      for (let attempt = 0; attempt < 6 && live; attempt++) {
        try {
          const p = await prepareBadgeShare(challengeId, result.id, result.level, false);
          if (live) setPrepared(p);
          return;
        } catch (err) {
          const notYet = err instanceof ApiClientError && err.code === "not_earned";
          if (!notYet || attempt === 5) {
            if (live) setMessage({ tone: "bad", text: notYet ? "This badge is still syncing. Try again in a moment." : "Connect to the internet to save or share this badge." });
            return;
          }
          await getSyncEngine()
            .sync()
            .catch(() => undefined);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [challengeId, result.id, result.level]);

  useEffect(() => {
    if (!prepared || files[format]) return;
    let live = true;
    fetch(`${prepared.imageUrl}?format=${format}`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("image"))))
      .then((blob) => {
        if (live) setFiles((f) => ({ ...f, [format]: new File([blob], `still-reading-${result.id.replace(/_/g, "-")}-${format}.png`, { type: "image/png" }) }));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [prepared, format, result.id, files]);

  const file = files[format] ?? null;
  const link = prepared ? `${window.location.origin}${prepared.url}` : null;
  const text = `I just earned the ${name} badge on Still Reading${result.stat ? ` (${result.stat})` : ""} 📚${link ? ` ${link}` : ""}`;

  const failed = (err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") return; // Closed the share sheet.
    setMessage({ tone: "bad", text: "Couldn't do that. Try again." });
  };

  const share = async () => {
    setMessage(null);
    // Start making the page public now; the share sheet must open in this same tap.
    const going = prepareBadgeShare(challengeId, result.id, result.level, true).catch(() => null);
    try {
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else if (navigator.share && link) await navigator.share({ title: name, text, url: link });
      else {
        await going;
        await navigator.clipboard.writeText(text);
        setMessage({ tone: "good", text: "Link copied. Paste it into your post or story." });
      }
    } catch (err) {
      failed(err);
    }
  };

  const save = async () => {
    setMessage(null);
    if (!file) return;
    try {
      // iPhone: the share sheet has "Save Image", which puts it in Photos.
      if (isIos() && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage({ tone: "good", text: "Saved." });
    } catch (err) {
      failed(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Segmented
        label="Card size"
        value={format}
        onChange={setFormat}
        options={[
          { value: "story", label: "Story" },
          { value: "square", label: "Post" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" disabled={!prepared || busy} onClick={() => void share()}>
          Share
        </Button>
        <Button size="lg" variant="secondary" disabled={!file || busy} onClick={() => void save()}>
          {file ? "Save image" : "Preparing…"}
        </Button>
      </div>
      {message ? (
        <p className={message.tone === "good" ? "text-center text-sm font-medium text-good" : "text-center text-sm text-[#c2321f]"} role="status">
          {message.text}
        </p>
      ) : null}
      <p className="text-center text-xs text-muted">Sharing makes a page for this badge that anyone with the link can see, with your name on it.</p>
    </div>
  );
}
