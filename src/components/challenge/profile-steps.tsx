"use client";
import { useState } from "react";
import type { GoalPreset } from "@/lib/domain/goals";
import { displayName as displayNameSchema } from "@/lib/validation/fields";
import type { ProfileInput } from "@/local/repo";
import { BookForm, bookDraftToInput, emptyBook, type BookDraft } from "../books/book-form";
import { GoalSelector, isGoalValid } from "../goals/goal-selector";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/field";
import { Notice } from "../ui/misc";

export type ProfileStep = "name" | "goal" | "book";

export function StepHeader({ step, total, title, subtitle }: { step: number; total: number; title: string; subtitle?: string }) {
  return (
    <header className="mb-8">
      <div className="flex gap-1.5" aria-label={`Step ${step} of ${total}`} role="img">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < step ? "h-1 w-8 rounded-full bg-ink" : "h-1 w-8 rounded-full bg-ink/12"} />
        ))}
      </div>
      <p className="sr-only">
        Step {step} of {total}
      </p>
      <h1 className="display mt-6 text-[44px] text-balance">{title}</h1>
      {subtitle ? <p className="mt-3 text-[17px] leading-snug text-ink/55">{subtitle}</p> : null}
    </header>
  );
}

/**
 * Name → goal → optional book. Used by both "create" (host) and "join" flows.
 * `stepOffset` lets the caller number steps after its own.
 */
export function ProfileSteps({
  durationDays,
  stepOffset,
  totalSteps,
  submitLabel,
  submitting,
  error,
  onBack,
  onSubmit,
}: {
  durationDays: number;
  stepOffset: number;
  totalSteps: number;
  submitLabel: string;
  submitting: boolean;
  error: string | null;
  onBack?: () => void;
  onSubmit: (profile: ProfileInput) => void;
}) {
  const [step, setStep] = useState<ProfileStep>("name");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [goal, setGoal] = useState<GoalPreset>({ kind: "pages_per_day", value: 20 });
  const [book, setBook] = useState<BookDraft>(emptyBook);

  const submit = (withBook: boolean) => {
    const b = withBook ? bookDraftToInput(book) : null;
    onSubmit({ displayName: name.trim(), goal, book: b && b.title ? b : null });
  };

  if (step === "name") {
    return (
      <form
        className="animate-rise"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = displayNameSchema.safeParse(name);
          if (!parsed.success) return setNameError(parsed.error.issues[0]?.message ?? "Enter your name");
          setNameError(null);
          setStep("goal");
        }}
      >
        <StepHeader step={stepOffset + 1} total={totalSteps} title="What's your name?" subtitle="This is how your reading crew will see you." />
        <Field label="Your name" error={nameError}>
          {(p) => <Input {...p} autoFocus autoComplete="given-name" maxLength={40} placeholder="Jessica" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Notice className="mt-5">
          <p>
            <span className="font-medium text-ink">Still Reading doesn&apos;t require an account.</span> Your personal progress is stored on this device and shared with
            your challenge. If you clear browser data or lose this device, your local profile may not be recoverable.
          </p>
          <p className="mt-2">Your name and challenge progress are visible to other members of this challenge.</p>
        </Notice>
        <div className="mt-8 flex gap-3">
          {onBack ? (
            <Button variant="secondary" onClick={onBack}>
              Back
            </Button>
          ) : null}
          <Button type="submit" full size="lg">
            Continue
          </Button>
        </div>
      </form>
    );
  }

  if (step === "goal") {
    return (
      <div className="animate-rise">
        <StepHeader
          step={stepOffset + 2}
          total={totalSteps}
          title="What do you want to accomplish?"
          subtitle="Everyone sets their own goal. Pick something you can keep showing up for."
        />
        <GoalSelector value={goal} onChange={setGoal} durationDays={durationDays} />
        <div className="mt-8 flex gap-3">
          <Button variant="secondary" onClick={() => setStep("name")}>
            Back
          </Button>
          <Button full size="lg" disabled={!isGoalValid(goal)} onClick={() => setStep("book")}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="animate-rise"
      onSubmit={(e) => {
        e.preventDefault();
        submit(true);
      }}
    >
      <StepHeader step={stepOffset + 3} total={totalSteps} title="What are you reading?" subtitle="Optional. You can add or switch books any time." />
      <BookForm value={book} onChange={setBook} />
      {error ? (
        <Notice tone="danger" className="mt-5">
          {error}
        </Notice>
      ) : null}
      <div className="mt-8 space-y-3">
        <Button type="submit" full size="lg" disabled={submitting || !book.title.trim()}>
          {submitting ? "One moment…" : submitLabel}
        </Button>
        <Button full variant="ghost" disabled={submitting} onClick={() => submit(false)}>
          Skip for now
        </Button>
        <Button full variant="ghost" disabled={submitting} onClick={() => setStep("goal")}>
          Back
        </Button>
      </div>
    </form>
  );
}
