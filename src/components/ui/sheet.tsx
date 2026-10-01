"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Bottom sheet built on <dialog> (focus trap, Escape, inert background for free). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[1.75rem] bg-card p-0 text-ink shadow-float sm:m-auto sm:max-w-lg sm:rounded-[1.75rem]"
    >
      {open ? (
        <div className="animate-rise px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden />
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full text-muted hover:bg-paper-2" aria-label="Close">
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
