"use client";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useChallenge } from "@/components/challenge/context";
import { Hero } from "@/components/challenge/hero";
import { ReadingFeedItem } from "@/components/feed/reading-feed";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageSheet } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { track } from "@/lib/analytics";
import { relativeDayLabel, timeAgo } from "@/lib/format";
import type { LocalReply } from "@/local/db";
import { addReply, deleteReply } from "@/local/repo";

/** A check-in and its replies, oldest first, with a reply box underneath. */
export default function ThreadPage() {
  const { view } = useChallenge();
  const { sessionId } = useParams<{ sessionId: string }>();
  const session = view.feed.find((s) => s.id === sessionId);
  const replies = view.repliesBySession.get(sessionId) ?? [];
  const person = session ? view.participantsById.get(session.participantId) : undefined;
  const archived = view.challenge.status === "archived";
  const back = { href: `/c/${view.challenge.id}/feed`, label: "Back to feed" };

  if (!session) {
    return (
      <>
        <Hero tone="dark" title="Thread" subtitle={view.challenge.name} back={back} className="pb-16" />
        <PageSheet>
          <EmptyState title="This check-in isn't here anymore">It may have been removed.</EmptyState>
        </PageSheet>
      </>
    );
  }

  return (
    <>
      <Hero
        tone="dark"
        title="Thread"
        subtitle={`${person?.displayName ?? "Someone"} · ${relativeDayLabel(session.date, view.today)}`}
        back={back}
        className="pb-16"
      />
      <PageSheet>
        <h1 className="sr-only">Thread on {person?.displayName ?? "someone"}&apos;s check-in</h1>
        <ul>
          <ReadingFeedItem view={view} session={session} inThread />
        </ul>
        <section aria-label="Replies" className="mt-2">
          <h2 className="eyebrow">{replies.length ? `${replies.length} ${replies.length === 1 ? "reply" : "replies"}` : "No replies yet"}</h2>
          {replies.length ? (
            <ul className="mt-2">
              {replies.map((r) => (
                <ReplyRow key={r.id} reply={r} author={view.participantsById.get(r.participantId)?.displayName} mine={r.participantId === view.challenge.myParticipantId} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Say something nice, ask about the book, or cheer them on.</p>
          )}
        </section>
        {archived ? (
          <p className="mt-6 text-sm text-muted">This challenge is archived, so replies are closed.</p>
        ) : (
          <ReplyBox challengeId={view.challenge.id} sessionId={session.id} replyingTo={person?.displayName ?? "them"} />
        )}
      </PageSheet>
    </>
  );
}

function ReplyRow({ reply, author, mine }: { reply: LocalReply; author: string | undefined; mine: boolean }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="dotted flex gap-3 py-4">
      <Avatar name={author ?? "?"} id={reply.participantId} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[15px] font-medium tracking-[-0.01em]">
            {author ?? "Someone"}
            {mine ? <span className="font-normal text-muted"> (you)</span> : null}
          </p>
          <span className="shrink-0 text-xs tabular text-ink/35">{timeAgo(reply.createdAt)}</span>
        </div>
        <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed text-ink/80">{reply.body}</p>
        {mine ? (
          <div className="mt-1.5 flex items-center gap-3 text-xs">
            {reply.syncStatus !== "synced" ? <span className="font-medium text-warn">{reply.syncStatus === "failed" ? "Not sent" : "Sending…"}</span> : null}
            {confirming ? (
              <>
                <button type="button" className="font-medium text-[#c2321f]" onClick={() => void deleteReply(reply.id)}>
                  Delete reply
                </button>
                <button type="button" className="text-muted" onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="text-muted hover:text-ink" onClick={() => setConfirming(true)}>
                Delete
              </button>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ReplyBox({ challengeId, sessionId, replyingTo }: { challengeId: string; sessionId: string; replyingTo: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLFormElement>(null);
  const [sent, setSent] = useState(0);

  useEffect(() => {
    if (sent) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [sent]);

  return (
    <form
      ref={endRef}
      className="mt-6 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || sending) return;
        setSending(true);
        try {
          await addReply(challengeId, sessionId, text);
          track("reply_added", { challengeId });
          setText("");
          setSent((n) => n + 1);
        } finally {
          setSending(false);
        }
      }}
    >
      <label htmlFor="reply-body" className="sr-only">
        Reply to {replyingTo}
      </label>
      <Textarea
        id="reply-body"
        className="bg-surface-2 shadow-none"
        maxLength={500}
        placeholder={`Reply to ${replyingTo.split(" ")[0]}…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs tabular text-muted">{text.length > 400 ? `${500 - text.length} left` : ""}</span>
        <Button type="submit" disabled={!text.trim() || sending}>
          {sending ? "Sending…" : "Reply"}
        </Button>
      </div>
    </form>
  );
}
