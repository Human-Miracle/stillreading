"use client";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useChallenge } from "@/components/challenge/context";
import { Hero } from "@/components/challenge/hero";
import { ReadingFeedItem } from "@/components/feed/reading-feed";
import { ReplyNotifyPrompt } from "@/components/notifications/reply-notifications";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageSheet } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/components/ui/cn";
import { track } from "@/lib/analytics";
import { relativeDayLabel, timeAgo } from "@/lib/format";
import type { LocalReply, LocalReplyLike } from "@/local/db";
import { addReply, deleteReply, setReplyLike } from "@/local/repo";

/** A check-in and its replies (one level of nested answers, like Instagram), with a reply box underneath. */
export default function ThreadPage() {
  const { view } = useChallenge();
  const { sessionId } = useParams<{ sessionId: string }>();
  const session = view.feed.find((s) => s.id === sessionId);
  const replies = view.repliesBySession.get(sessionId) ?? [];
  const person = session ? view.participantsById.get(session.participantId) : undefined;
  const archived = view.challenge.status === "archived";
  const me = view.challenge.myParticipantId;
  // You follow a thread on your own check-in, or once you've replied in it.
  const following = session?.participantId === me || replies.some((r) => r.participantId === me);
  const back = { href: `/c/${view.challenge.id}/feed`, label: "Back to feed" };
  const [target, setTarget] = useState<ReplyTarget | null>(null);
  const [text, setText] = useState("");

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

  // Answers sit under their top-level reply; an answer whose parent was deleted stands on its own.
  const ids = new Set(replies.map((r) => r.id));
  const topLevel = replies.filter((r) => !r.parentId || !ids.has(r.parentId));
  const answers = new Map<string, LocalReply[]>();
  for (const r of replies) {
    if (!r.parentId || !ids.has(r.parentId)) continue;
    const list = answers.get(r.parentId);
    if (list) list.push(r);
    else answers.set(r.parentId, [r]);
  }
  const nameOf = (r: LocalReply) => view.participantsById.get(r.participantId)?.displayName ?? "Someone";
  const row = (r: LocalReply, nested: boolean) => (
    <ReplyRow
      key={r.id}
      reply={r}
      author={nameOf(r)}
      mine={r.participantId === me}
      likes={view.likesByReply.get(r.id) ?? []}
      myParticipantId={me}
      challengeId={view.challenge.id}
      nested={nested}
      disabled={archived}
      onReply={() => {
        const name = nameOf(r);
        setTarget({ parentId: r.parentId && ids.has(r.parentId) ? r.parentId : r.id, name });
        // Answering a nested reply: start with @name so it's clear who it's for.
        const mention = `@${name.split(" ")[0]} `;
        if (nested) setText((t) => (t.startsWith(mention) ? t : mention + t));
      }}
    />
  );

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
              {topLevel.map((r) => (
                <li key={r.id} className="dotted py-4">
                  <ul>{row(r, false)}</ul>
                  <Answers answers={answers.get(r.id) ?? []} render={(a) => row(a, true)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Say something nice, ask about the book, or cheer them on.</p>
          )}
        </section>
        {archived ? (
          <p className="mt-6 text-sm text-muted">This challenge is archived, so replies are closed.</p>
        ) : (
          <>
            {following ? <ReplyNotifyPrompt challengeId={view.challenge.id} className="mt-6" /> : null}
            <ReplyBox
              challengeId={view.challenge.id}
              sessionId={session.id}
              replyingTo={person?.displayName ?? "them"}
              target={target}
              onClearTarget={() => setTarget(null)}
              text={text}
              setText={setText}
            />
          </>
        )}
      </PageSheet>
    </>
  );
}

interface ReplyTarget {
  /** Top-level reply the answer goes under. */
  parentId: string;
  name: string;
}

const SHOW_ANSWERS = 2;

/** Indented answers; long ones fold to the latest two behind "View N earlier replies". */
function Answers({ answers, render }: { answers: LocalReply[]; render: (r: LocalReply) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  if (!answers.length) return null;
  const hidden = expanded ? 0 : Math.max(0, answers.length - SHOW_ANSWERS);
  return (
    <div className="ml-11 mt-3 space-y-3 border-l border-line pl-3">
      {hidden ? (
        <button type="button" className="text-xs font-medium text-muted hover:text-ink" onClick={() => setExpanded(true)}>
          View {hidden} earlier {hidden === 1 ? "reply" : "replies"}
        </button>
      ) : null}
      <ul className="space-y-3">{answers.slice(hidden).map(render)}</ul>
    </div>
  );
}

/** "@Tobi thanks!" → the leading mention in bold. */
function ReplyText({ body }: { body: string }) {
  const m = /^(@\S+)(\s[\s\S]*)?$/.exec(body);
  if (!m) return <>{body}</>;
  return (
    <>
      <span className="font-medium text-ink">{m[1]}</span>
      {m[2] ?? ""}
    </>
  );
}

function ReplyRow({
  reply,
  author,
  mine,
  likes,
  myParticipantId,
  challengeId,
  nested,
  disabled,
  onReply,
}: {
  reply: LocalReply;
  author: string;
  mine: boolean;
  likes: LocalReplyLike[];
  myParticipantId: string;
  challengeId: string;
  nested: boolean;
  disabled: boolean;
  onReply: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const liked = likes.some((l) => l.participantId === myParticipantId);
  return (
    <li className="flex gap-3">
      <Avatar name={author} id={reply.participantId} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-[15px] font-medium tracking-[-0.01em]">
            {author}
            {mine ? <span className="font-normal text-muted"> (you)</span> : null}
          </p>
          <span className="shrink-0 text-xs tabular text-ink/35">{timeAgo(reply.createdAt)}</span>
        </div>
        <p className={cn("mt-0.5 whitespace-pre-line break-words leading-relaxed text-ink/80", nested ? "text-[14px]" : "text-[15px]")}>
          <ReplyText body={reply.body} />
        </p>
        <div className="mt-1.5 flex items-center gap-4 text-xs">
          {disabled ? null : (
            <button type="button" className="font-medium text-muted hover:text-ink" onClick={onReply} aria-label={`Reply to ${author}`}>
              Reply
            </button>
          )}
          {mine && reply.syncStatus !== "synced" ? <span className="font-medium text-warn">{reply.syncStatus === "failed" ? "Not sent" : "Sending…"}</span> : null}
          {mine ? (
            confirming ? (
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
            )
          ) : null}
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={liked}
        aria-label={`Like ${author}'s reply${likes.length ? `, ${likes.length}` : ""}`}
        onClick={() => void setReplyLike(challengeId, reply.id, !liked)}
        className={cn("flex w-8 shrink-0 flex-col items-center pt-1 transition-transform active:scale-90", liked ? "text-[#e0245e]" : "text-ink/35 hover:text-ink/60")}
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
        </svg>
        {likes.length ? <span className="mt-0.5 text-[11px] font-medium tabular text-ink/50">{likes.length}</span> : null}
      </button>
    </li>
  );
}

function ReplyBox({
  challengeId,
  sessionId,
  replyingTo,
  target,
  onClearTarget,
  text,
  setText,
}: {
  challengeId: string;
  sessionId: string;
  replyingTo: string;
  target: ReplyTarget | null;
  onClearTarget: () => void;
  text: string;
  setText: (t: string) => void;
}) {
  const [sending, setSending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [sent, setSent] = useState(0);

  useEffect(() => {
    if (sent) formRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [sent]);

  // Choosing "Reply" on a reply: bring the box into view and focus it.
  useEffect(() => {
    if (!target) return;
    formRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    inputRef.current?.focus({ preventScroll: true });
  }, [target]);

  return (
    <form
      ref={formRef}
      className="mt-6 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || sending) return;
        setSending(true);
        try {
          await addReply(challengeId, sessionId, text, target?.parentId ?? null);
          track("reply_added", { challengeId, props: { nested: Boolean(target) } });
          setText("");
          onClearTarget();
          setSent((n) => n + 1);
        } finally {
          setSending(false);
        }
      }}
    >
      {target ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-ink/70">
            Replying to <span className="font-medium text-ink">{target.name}</span>
          </span>
          <button type="button" className="shrink-0 text-muted hover:text-ink" aria-label="Cancel reply to this person" onClick={onClearTarget}>
            <Icon.close className="size-4" />
          </button>
        </div>
      ) : null}
      <label htmlFor="reply-body" className="sr-only">
        {target ? `Reply to ${target.name}` : `Reply to ${replyingTo}`}
      </label>
      <Textarea
        ref={inputRef}
        id="reply-body"
        className="bg-surface-2 shadow-none"
        maxLength={500}
        placeholder={target ? `Reply to ${target.name.split(" ")[0]}…` : `Reply to ${replyingTo.split(" ")[0]}…`}
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
