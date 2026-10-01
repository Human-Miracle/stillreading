"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icons";

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
      className="m-0 mt-auto max-h-[94dvh] w-full max-w-none overflow-y-auto rounded-t-sheet bg-surface p-0 text-ink shadow-float sm:mx-auto sm:mb-6 sm:max-w-[440px] sm:rounded-sheet"
    >
      {open ? (
        <div className="animate-rise px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-ink/15" aria-hidden />
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="headline text-[26px]">{title}</h2>
            <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink hover:bg-line" aria-label="Close">
              <Icon.close />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
