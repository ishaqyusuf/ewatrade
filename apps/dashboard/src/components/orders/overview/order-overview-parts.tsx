"use client"

import { cn } from "@ewatrade/ui"
import { SquareLock01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"
import type { PillTone } from "./order-overview-model"

const PILL: Record<PillTone, string> = {
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  blue: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  muted: "bg-muted text-muted-foreground",
  red: "bg-red-500/15 text-red-700 dark:text-red-300",
}

export function Pill({
  tone,
  children,
}: {
  tone: PillTone
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
        PILL[tone],
      )}
    >
      {children}
    </span>
  )
}

/** A bordered card whose header carries its own Change/Edit link or lock. */
export function OverviewCard({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        {action}
      </header>
      {children}
    </section>
  )
}

/** Why a change is not available, kept visible instead of hiding the action. */
export function LockedReason({
  reason,
  wrap = false,
}: { reason: string; wrap?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 gap-1.5 text-xs text-muted-foreground",
        wrap ? "items-start" : "items-center",
      )}
    >
      <HugeiconsIcon
        icon={SquareLock01Icon}
        className={cn("size-3.5 shrink-0", wrap && "mt-px")}
      />
      <span className={wrap ? "whitespace-normal" : "truncate"}>{reason}</span>
    </span>
  )
}
