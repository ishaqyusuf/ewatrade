import { cn } from "@/utils"
import type { ReactNode } from "react"

export type SettingsStatusTone = "bad" | "muted" | "ok" | "warn"

/** Small rounded status label for settings rows (Ready, Live, Needs setup). */
export function SettingsStatusPill({
  children,
  tone,
}: {
  children: ReactNode
  tone: SettingsStatusTone
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "ok" &&
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
        tone === "warn" &&
          "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
        tone === "bad" && "bg-destructive/10 text-destructive",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}
