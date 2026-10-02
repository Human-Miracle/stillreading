"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useChallenge } from "@/components/challenge/context";
import { DuplicateMembers } from "@/components/challenge/duplicate-members";
import { InviteActions } from "@/components/challenge/invite-actions";
import { ReplyNotificationsCard } from "@/components/notifications/reply-notifications";
import { GoalSelector, isGoalValid } from "@/components/goals/goal-selector";
import { Hero } from "@/components/challenge/hero";
import { APP_VERSION, refreshApp } from "@/components/pwa/app-update";
import { openInstallModal } from "@/components/pwa/install-modal";
import { PassSettings } from "@/components/pass/pass-settings";
import { PasteFromBrowser } from "@/components/pwa/open-in-app";
import { ReinviteButton } from "@/components/pass/reinvite";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { track } from "@/lib/analytics";
import { describeGoal, presetFromGoal, type GoalPreset } from "@/lib/domain/goals";
import { formatDateKey } from "@/lib/format";
import { challengeName as challengeNameSchema, displayName as displayNameSchema } from "@/lib/validation/fields";
import { archiveChallenge, leaveChallenge, removeParticipant, setGoal, updateChallengeDetails, updateDisplayName } from "@/local/repo";

function Saved({ show }: { show: boolean }) {
  return show ? (
    <span className="text-sm font-medium text-good" role="status">
      Saved ✓
    </span>
  ) : null;
}

export default function SettingsPage() {
  const router = useRouter();
  const { view } = useChallenge();
  const { challenge, me } = view;
  const archived = challenge.status === "archived";

  const [name, setName] = useState(me?.participant.displayName ?? "");
  const [refreshing, setRefreshing] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [goal, setGoalDraft] = useState<GoalPreset>(me?.goal ? presetFromGoal(me.goal) : { kind: "pages_per_day", value: 20 });
  const [goalSaved, setGoalSaved] = useState(false);
  const [cName, setCName] = useState(challenge.name);
  const [cDesc, setCDesc] = useState(challenge.description);
  const [cError, setCError] = useState<string | null>(null);
  const [cSaved, setCSaved] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  if (!me) return null;

  const flash = (set: (v: boolean) => void) => {
    set(true);
    setTimeout(() => set(false), 2500);
  };

  return (
    <>
      <Hero tone="paper" title="Settings" subtitle={challenge.name} back={{ href: `/c/${challenge.id}`, label: "Back to challenge" }}>
        <h1 className="display px-5 pb-2 pt-8 text-[56px]">Settings</h1>
      </Hero>
      <div className="space-y-3 px-5 pt-4">

      <Card className="space-y-4">
        <Eyebrow>Your profile</Eyebrow>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const parsed = displayNameSchema.safeParse(name);
            if (!parsed.success) return setNameError(parsed.error.issues[0]?.message ?? "Invalid name");
            setNameError(null);
            await updateDisplayName(challenge.id, parsed.data);
            flash(setNameSaved);
          }}
        >
          <Field label="Display name" error={nameError}>
            {(p) => <Input {...p} maxLength={40} value={name} disabled={archived} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary" disabled={archived || name.trim() === me.participant.displayName}>
              Save name
            </Button>
            <Saved show={nameSaved} />
          </div>
        </form>
      </Card>

      <PassSettings />
      <PasteFromBrowser />

      <Card className="space-y-4">
        <Eyebrow>Your goal</Eyebrow>
        {me.goal ? <p className="text-ink-2">Current: {describeGoal(me.goal)}</p> : null}
        {!archived ? (
          <>
            <GoalSelector value={goal} onChange={setGoalDraft} durationDays={me.progress.effectiveDuration} />
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                disabled={!isGoalValid(goal)}
                onClick={async () => {
                  await setGoal(challenge.id, goal);
                  track("goal_selected", { challengeId: challenge.id, props: { kind: goal.kind, changed: true } });
                  flash(setGoalSaved);
                }}
              >
                Update goal
              </Button>
              <Saved show={goalSaved} />
            </div>
            <p className="text-sm text-muted">Your past reading stays. Progress is recalculated against the new goal.</p>
          </>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <Eyebrow>Challenge</Eyebrow>
        <p className="text-ink-2">
          {formatDateKey(challenge.startDate, { month: "long", day: "numeric" })} – {formatDateKey(challenge.endDate, { month: "long", day: "numeric", year: "numeric" })} ·{" "}
          {challenge.durationDays} days
        </p>
        <p className="text-sm text-muted">Days roll over at midnight {challenge.timezone} time.</p>
        {!archived ? <InviteActions joinCode={challenge.joinCode} challengeName={challenge.name} challengeId={challenge.id} /> : null}
      </Card>

      {view.isHost && !archived ? (
        <Card className="space-y-5">
          <Eyebrow>Host controls</Eyebrow>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const parsed = challengeNameSchema.safeParse(cName);
              if (!parsed.success) return setCError(parsed.error.issues[0]?.message ?? "Invalid name");
              setCError(null);
              await updateChallengeDetails(challenge.id, parsed.data, cDesc.trim());
              flash(setCSaved);
            }}
          >
            <Field label="Challenge name" error={cError}>
              {(p) => <Input {...p} maxLength={80} value={cName} onChange={(e) => setCName(e.target.value)} />}
            </Field>
            <Field label="Description">
              {(p) => <Textarea {...p} maxLength={500} value={cDesc} onChange={(e) => setCDesc(e.target.value)} />}
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="secondary">
                Save details
              </Button>
              <Saved show={cSaved} />
            </div>
          </form>

          <div className="space-y-2">
            <p className="text-sm font-medium text-ink-2">Participants</p>
            <ul>
              {view.members.map((m) => (
                <li key={m.participant.id} className="dotted flex items-center gap-3 py-3">
                  <Avatar name={m.participant.displayName} id={m.participant.id} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{m.participant.displayName}</span>
                  {m.participant.id !== me.participant.id ? (
                    confirm === `remove:${m.participant.id}` ? (
                      <Button size="sm" variant="danger" onClick={() => void removeParticipant(challenge.id, m.participant.id).then(() => setConfirm(null))}>
                        Confirm remove
                      </Button>
                    ) : (
                      <span className="flex">
                        <ReinviteButton challengeId={challenge.id} participantId={m.participant.id} name={m.participant.displayName} />
                        <Button size="sm" variant="ghost" onClick={() => setConfirm(`remove:${m.participant.id}`)}>
                          Remove
                        </Button>
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-muted">Host (you)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-sm text-ink-2">Archiving ends the challenge for everyone. Progress stays viewable.</p>
            {confirm === "archive" ? (
              <div className="flex gap-2">
                <Button variant="danger" onClick={() => void archiveChallenge(challenge.id).then(() => setConfirm(null))}>
                  Yes, archive it
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="danger" onClick={() => setConfirm("archive")}>
                Archive challenge
              </Button>
            )}
          </div>
        </Card>
      ) : null}

      {view.isHost && !archived ? <DuplicateMembers view={view} /> : null}

      {!view.isHost && !archived ? (
        <Card className="space-y-3">
          <Eyebrow>Leave</Eyebrow>
          <p className="text-ink-2">You can rejoin later with the invite link.</p>
          {confirm === "leave" ? (
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={async () => {
                  await leaveChallenge(challenge.id);
                  router.push("/");
                }}
              >
                Leave challenge
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirm("leave")}>
              Leave challenge
            </Button>
          )}
        </Card>
      ) : null}

      <Card className="flex items-center justify-between gap-4">
        <div>
          <Eyebrow>App</Eyebrow>
          <p className="mt-1 text-ink/70">Put Still Reading on your home screen.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={openInstallModal}>
          Install app
        </Button>
      </Card>

      <ReplyNotificationsCard challengeId={challenge.id} />

      <Card className="flex items-center justify-between gap-4">
        <div>
          <Eyebrow>Version</Eyebrow>
          <p className="mt-1 text-ink/70">
            You&apos;re on <span className="tabular">{APP_VERSION}</span>. Not seeing something new?
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            void refreshApp();
          }}
        >
          {refreshing ? "Updating…" : "Update app"}
        </Button>
      </Card>

      <Notice>
        <p className="font-medium text-ink">About your data</p>
        <p className="mt-1">
          Still Reading doesn&apos;t use accounts. Your progress lives on this device and is shared with this challenge&apos;s members: your name, books, goal,
          reading amounts, streak and shared reflections. Private reflections never leave this device. If you clear browser data or lose this device, your
          local profile may not be recoverable.
        </p>
      </Notice>
      </div>
    </>
  );
}
