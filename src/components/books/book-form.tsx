"use client";
import { Field, Input } from "../ui/field";

export interface BookDraft {
  title: string;
  author: string;
  totalPages: string;
}

export const emptyBook: BookDraft = { title: "", author: "", totalPages: "" };

export function bookDraftToInput(d: BookDraft) {
  const pages = Number.parseInt(d.totalPages, 10);
  return { title: d.title.trim(), author: d.author.trim() || null, totalPages: Number.isFinite(pages) && pages > 0 ? Math.min(pages, 20000) : null };
}

export function BookForm({ value, onChange, autoFocus }: { value: BookDraft; onChange: (v: BookDraft) => void; autoFocus?: boolean }) {
  return (
    <div className="space-y-4">
      <Field label="Title">
        {(p) => (
          <Input
            {...p}
            autoFocus={autoFocus}
            maxLength={200}
            placeholder="Atomic Habits"
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
          />
        )}
      </Field>
      <Field label="Author (optional)">
        {(p) => <Input {...p} maxLength={120} placeholder="James Clear" value={value.author} onChange={(e) => onChange({ ...value, author: e.target.value })} />}
      </Field>
      <Field label="Total pages (optional)" hint="Helps track how far through the book you are.">
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="320"
            value={value.totalPages}
            onChange={(e) => onChange({ ...value, totalPages: e.target.value.replace(/\D/g, "").slice(0, 5) })}
          />
        )}
      </Field>
    </div>
  );
}
