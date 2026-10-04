"use client";
import { useState } from "react";
import { timeAgo } from "@/lib/format";
import { dismissPrompt, promptDismissed, useReplyNotifications, type LastDelivery } from "@/local/notifications";
import { openInstallModal } from "../pwa/install-modal";
import { Button } from "../ui/button";
import { Card, Eyebrow } from "../ui/card";
import { Icon } from "../ui/icons";

/** Settings card: notifications for this challenge on this device (replies), plus the reading reminder switch. */
export function ReplyNotificationsCard({ challengeId }: { challengeId: string }) {
  const { status, busy, error, enable, disable, reminders, setReminders, lastDelivery } = useReplyNotifications(challengeId);
  if (status === "loading" || status === "unavailable") return null;

  let text: string;
  let action: React.ReactNode = null;
  switch (status) {
    case "on":
      text = "On for this device. You'll hear when someone replies to your check-ins or a thread you're in.";
      action = (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void disable()}>
          Turn off
        </Button>
      );
      break;
    case "off":
      text = "Get a notification when someone replies to your check-ins, and a gentle reminder if you haven't logged your reading.";
      action = (
        <Button size="sm" disabled={busy} onClick={() => void enable()}>
          {busy ? "One moment…" : "Turn on"}
        </Button>
      );
      break;
    case "needs-install":
      text = "On iPhone and iPad, notifications work in the Home Screen app. Add Still Reading to your Home Screen, then turn them on here.";
      action = (
        <Button variant="secondary" size="sm" onClick={openInstallModal}>
          Install app
        </Button>
      );
      break;
    case "denied":
      text = "Notifications are blocked for Still Reading. Allow them in your phone or browser settings, then come back here.";
      break;
    case "unsupported":
      text = "This browser can't show notifications. Try the installed app or another browser.";
      break;
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Notifications</Eyebrow>
          <p className="mt-1 text-ink/70">{text}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {status === "on" && lastDelivery ? <DeliveryLine delivery={lastDelivery} /> : null}
      {status === "on" ? (
        <label className="flex items-start justify-between gap-4 border-t border-line pt-3">
          <span>
            <span className="block font-medium">Reading reminders</span>
            <span className="block text-sm text-muted">A nudge if you haven&apos;t logged today, or if you missed yesterday and have a Time Stone to bring it back. Daytime only, at most once every 5 hours.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="mt-1 size-5 shrink-0 accent-ink"
            checked={reminders}
            onChange={(e) => void setReminders(e.target.checked)}
            aria-label="Reading reminders"
          />
        </label>
      ) : null}
      {error ? (
        <p className="text-sm text-[#c2321f]" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

/** The push service's reason, e.g. `{"reason":"BadJwtToken"}` → "BadJwtToken". */
function reasonOf(detail: string | null): string | null {
  if (!detail) return null;
  try {
    const parsed = JSON.parse(detail) as { reason?: unknown };
    if (typeof parsed.reason === "string") return parsed.reason;
  } catch {
    // plain text
  }
  return detail;
}

/** Whether the last notification sent to this phone arrived at the push service, in plain words. */
function DeliveryLine({ delivery }: { delivery: LastDelivery }) {
  const when = timeAgo(delivery.at);
  if (delivery.result === "sent") return <p className="text-sm text-muted">Last notification sent to this phone {when}.</p>;
  const reason = reasonOf(delivery.detail);
  // Problems with this phone's push address can be fixed from the phone; anything else is on our side.
  const phoneSide = /BadDeviceToken|Unregistered|ExpiredSubscription|DeviceTokenNotForTopic/i.test(reason ?? "");
  return (
    <p className="text-sm text-[#c2321f]">
      The last notification ({when}) couldn&apos;t be delivered{reason ? ` (${reason})` : ""}.{" "}
      {phoneSide ? "Turn notifications off and on again to fix it." : "That's a problem on our side, not your phone, and it's being fixed."}
    </p>
  );
}

/** A one-time nudge at a natural moment (after posting). Hidden once dismissed or turned on. */
export function ReplyNotifyPrompt({ challengeId, className }: { challengeId: string; className?: string }) {
  const { status, busy, error, enable } = useReplyNotifications(challengeId);
  const [dismissed, setDismissed] = useState(() => promptDismissed(challengeId));
  if ((status !== "off" && status !== "needs-install") || dismissed) return null;
  const needsInstall = status === "needs-install";
  return (
    <div className={className} role="region" aria-label="Reply notifications">
      <div className="flex items-start gap-3 rounded-2xl bg-butter/60 px-4 py-3 text-left">
        <Icon.reply className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Know when friends reply</p>
          <p className="text-sm text-ink/70">
            {needsInstall
              ? "On iPhone, notifications only work in the Home Screen app. Add Still Reading to your Home Screen, open it from there and turn them on."
              : "Get a notification when someone replies, and a gentle reminder to read."}
          </p>
          {error ? (
            <p className="mt-1 text-sm text-[#c2321f]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-2.5 flex gap-2">
            {needsInstall ? (
              <Button size="sm" onClick={openInstallModal}>
                Add to Home Screen
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => void enable()}>
                {busy ? "One moment…" : "Turn on"}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                dismissPrompt(challengeId);
                setDismissed(true);
              }}
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
