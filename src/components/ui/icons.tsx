import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: "size-5", ...p });

export const Icon = {
  back: (p: P) => (
    <svg {...base(p)}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  ),
  more: (p: P) => (
    <svg {...base(p)}>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  plus: (p: P) => (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  home: (p: P) => (
    <svg {...base(p)}>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </svg>
  ),
  feed: (p: P) => (
    <svg {...base(p)}>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M8 10h8M8 14h5" />
    </svg>
  ),
  people: (p: P) => (
    <svg {...base(p)}>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.6c1.5.6 2.5 2 3 4.4" />
    </svg>
  ),
  me: (p: P) => (
    <svg {...base(p)}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1-3.6 3.7-5.5 7-5.5s6 1.9 7 5.5" />
    </svg>
  ),
  send: (p: P) => (
    <svg {...base(p)}>
      <path d="M20 4 10.5 13.5M20 4l-6 16-3.5-6.5L4 10z" />
    </svg>
  ),
  chart: (p: P) => (
    <svg {...base(p)}>
      <path d="M5 19V11M12 19V5M19 19v-6" />
    </svg>
  ),
  book: (p: P) => (
    <svg {...base(p)}>
      <path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2zM6 18a2 2 0 0 1 2-2h10" />
    </svg>
  ),
  chevron: (p: P) => (
    <svg {...base(p)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  ),
  check: (p: P) => (
    <svg {...base(p)}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  ),
  close: (p: P) => (
    <svg {...base(p)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  /** Lightning with speed lines, from the streak banner reference. */
  streak: (p: P) => (
    <svg viewBox="0 0 32 24" fill="none" aria-hidden className="h-6 w-8" {...p}>
      <path d="M2 8h7M4 12h5M2 16h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".5" />
      <path d="M21 2 12 14h7l-2 8 9-12h-7z" fill="currentColor" />
    </svg>
  ),
  info: (p: P) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
};
