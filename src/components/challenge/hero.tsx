"use client";
import type { ReactNode } from "react";
import { SyncIndicator } from "../sync/sync-indicator";
import { IconLink } from "../ui/button";
import { cn } from "../ui/cn";
import { Icon } from "../ui/icons";

export type HeroTone = "paper" | "lavender" | "honey" | "dark" | "sky" | "blush";

const TONES: Record<HeroTone, string> = {
  paper: "bg-paper text-ink",
  lavender: "bg-[linear-gradient(180deg,#bdbcfa_0%,#cfcefb_40%,#e4e2f6_75%,var(--paper)_100%)] text-ink",
  honey: "bg-[linear-gradient(180deg,#b77b09_0%,#cd951f_30%,#e4bb5a_55%,#f5e2ac_78%,#ffffff_100%)] text-ink",
  dark: "bg-ink text-white",
  sky: "bg-[linear-gradient(180deg,#b5cdf3_0%,#cddcf5_45%,var(--paper)_100%)] text-ink",
  blush: "bg-[linear-gradient(180deg,#f2b1d3_0%,#f7cfe3_45%,var(--paper)_100%)] text-ink",
};

/**
 * Full-bleed coloured hero with the challenge header row
 * (dashed back button · title · sync status · settings).
 */
export function Hero({
  tone,
  title,
  subtitle,
  back,
  settingsHref,
  children,
  className,
}: {
  tone: HeroTone;
  title?: string;
  subtitle?: string;
  back: { href: string; label: string };
  settingsHref?: string;
  children?: ReactNode;
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <header className={cn("relative pt-[max(0.75rem,env(safe-area-inset-top))]", TONES[tone], className)}>
      <div className="flex items-center gap-3 px-5 pt-2">
        <IconLink href={back.href} label={back.label} variant={dark ? "dark" : "dashed"}>
          <Icon.back />
        </IconLink>
        <div className="min-w-0 flex-1">
          {title ? <p className={cn("truncate text-[15px] font-medium tracking-[-0.02em]", dark ? "text-white" : "text-ink")}>{title}</p> : null}
          {subtitle ? <p className={cn("truncate text-xs", dark ? "text-white/55" : "text-ink/55")}>{subtitle}</p> : null}
        </div>
        <SyncIndicator dark={dark} />
        {settingsHref ? (
          <IconLink href={settingsHref} label="Challenge settings" variant={dark ? "dark" : "glass"}>
            <Icon.settings />
          </IconLink>
        ) : null}
      </div>
      {children}
    </header>
  );
}
