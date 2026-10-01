"use client";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { InviteActions } from "@/components/challenge/invite-actions";
import { ProfileSteps, StepHeader } from "@/components/challenge/profile-steps";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { Notice, Wordmark } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import { track } from "@/lib/analytics";
import { endDateFor, todayInTimezone } from "@/lib/domain/dates";
import { formatDateKey, monthName } from "@/lib/format";
import { challengeName as nameSchema } from "@/lib/validation/fields";
import { ApiClientError } from "@/local/api";
import { setPref } from "@/local/device";
import { createChallenge, type ProfileInput } from "@/local/repo";
import type { ChallengeSnapshot } from "@/lib/api-types";
import Link from "next/link";

const TOTAL_STEPS = 4;

function deviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export default function CreatePage() {
  // Timezone and "today" come from the device, so render only on the client.
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return isClient ? <CreateFlow /> : null;
}

const noopSubscribe = () => () => {};

function CreateFlow() {
  const router = useRouter();
  const [timezone] = useState(deviceTimezone);
  const [today] = useState(() => todayInTimezone(timezone));
  const [stage, setStage] = useState<"details" | "profile" | "done">("details");
  const [startDate, setStartDate] = useState(today);
  const [name, setName] = useState(`${monthName(today)} Reading Challenge`);
  const [nameTouched, setNameTouched] = useState(false);
  const [duration, setDuration] = useState<number | "custom">(30);
  const [customDays, setCustomDays] = useState("21");
  const [description, setDescription] = useState("");
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ChallengeSnapshot | null>(null);

  const durationDays = duration === "custom" ? Math.max(1, Math.min(365, Number.parseInt(customDays, 10) || 0)) : duration;

  const submit = async (profile: ProfileInput) => {
    setSubmitting(true);
    setError(null);
    try {
      const snap = await createChallenge({ name: name.trim(), description: description.trim(), startDate, durationDays, timezone, host: profile });
      await setPref("installPromptPending", true);
      track("challenge_created", { challengeId: snap.challenge.id, props: { durationDays } });
      track("goal_selected", { challengeId: snap.challenge.id, props: { kind: profile.goal.kind } });
      if (profile.book) track("book_added", { challengeId: snap.challenge.id });
      setCreated(snap);
      setStage("done");
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 0
          ? "You're offline. Creating a challenge needs a connection so we can make your invite link."
          : err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-[440px] px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <nav className="mb-8 flex items-center justify-between py-2">
        <Link href="/" aria-label="Still Reading home">
          <Wordmark className="text-[19px]" />
        </Link>
      </nav>

      {stage === "details" ? (
        <form
          className="animate-rise space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = nameSchema.safeParse(name);
            if (!parsed.success) return setDetailsError(parsed.error.issues[0]?.message ?? "Name your challenge");
            if (duration === "custom" && (durationDays < 2 || durationDays > 365)) return setDetailsError("Choose between 2 and 365 days");
            setDetailsError(null);
            setStage("profile");
          }}
        >
          <StepHeader step={1} total={TOTAL_STEPS} title="Start a reading challenge" subtitle="Invite friends. Everyone picks their own book and goal." />
          <Field label="Challenge name" error={detailsError}>
            {(p) => (
              <Input
                {...p}
                maxLength={80}
                value={name}
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Start date" hint={`Ends ${formatDateKey(endDateFor(startDate, durationDays), { weekday: "short", month: "short", day: "numeric" })} · ${timezone}`}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={startDate}
                min={today}
                onChange={(e) => {
                  const v = e.target.value || today;
                  setStartDate(v);
                  if (!nameTouched) setName(`${monthName(v)} Reading Challenge`);
                }}
              />
            )}
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink-2" id="duration-label">
              Duration
            </p>
            <Segmented
              label="Duration"
              value={duration}
              onChange={setDuration}
              options={[
                { value: 7, label: "7 days" },
                { value: 14, label: "14 days" },
                { value: 30, label: "30 days" },
                { value: "custom", label: "Custom" },
              ]}
            />
            {duration === "custom" ? (
              <Field label="Number of days">
                {(p) => <Input {...p} inputMode="numeric" value={customDays} onChange={(e) => setCustomDays(e.target.value.replace(/\D/g, "").slice(0, 3))} />}
              </Field>
            ) : null}
          </div>
          <Field label="Description (optional)">
            {(p) => (
              <Textarea {...p} maxLength={500} placeholder="30 days of reading together. Any book counts." value={description} onChange={(e) => setDescription(e.target.value)} />
            )}
          </Field>
          <Notice>Invite-only: only people with your link can join.</Notice>
          <Button type="submit" full size="lg">
            Continue
          </Button>
        </form>
      ) : null}

      {stage === "profile" ? (
        <ProfileSteps
          durationDays={durationDays}
          stepOffset={1}
          totalSteps={TOTAL_STEPS}
          submitLabel="Create challenge"
          submitting={submitting}
          error={error}
          onBack={() => setStage("details")}
          onSubmit={submit}
        />
      ) : null}

      {stage === "done" && created ? (
        <section className="animate-rise space-y-6 pt-4">
          <div className="grid size-20 animate-pop place-items-center rounded-full bg-butter" aria-hidden>
            <Icon.check className="size-9" strokeWidth={2} />
          </div>
          <h1 className="display text-[52px]">Your challenge is ready</h1>
          <p className="text-[17px] text-ink/60">Invite your friends. The more people show up, the easier it gets.</p>
          <div>
            <InviteActions joinCode={created.challenge.joinCode} challengeName={created.challenge.name} challengeId={created.challenge.id} />
          </div>
          <Button variant="secondary" full size="lg" onClick={() => router.push(`/c/${created.challenge.id}`)}>
            Go to my challenge
          </Button>
        </section>
      ) : null}
    </main>
  );
}
