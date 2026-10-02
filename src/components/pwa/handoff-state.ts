"use client";
/** Open state of the "Continue in the app" sheet, shared by the bar, the install modal and the sheet. */
let open = false;
const listeners = new Set<() => void>();

export function subscribeHandoffSheet(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export const isHandoffSheetOpen = () => open;
export function setHandoffSheetOpen(v: boolean) {
  open = v;
  listeners.forEach((fn) => fn());
}
export const openHandoffSheet = () => setHandoffSheetOpen(true);
