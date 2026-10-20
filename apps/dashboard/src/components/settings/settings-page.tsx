import { cn } from "@/utils"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"

/**
 * Settings page building blocks: one header pattern, titled sections that hold
 * rows (label and help on the left, control on the right).
 */
export function SettingsPage({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 gap-7">{children}</div>
}

export function SettingsHeader({
  actions,
  description,
  title,
}: {
  actions?: ReactNode
  description?: ReactNode
  title: string
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
      <div className="min-w-0 flex-[1_1_320px]">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}

export function SettingsSection({
  action,
  bare,
  children,
  className,
  description,
  title,
}: {
  action?: ReactNode
  /** Render children without the bordered row card. */
  bare?: boolean
  children: ReactNode
  className?: string
  description?: ReactNode
  title?: string
}) {
  return (
    <section className={cn("grid min-w-0 gap-2.5", className)}>
      {title || action ? (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-[15px] font-semibold">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      {bare ? (
        children
      ) : (
        <div className="divide-y divide-border rounded-[10px] border border-border bg-card">
          {children}
        </div>
      )}
    </section>
  )
}

export function SettingsRow({
  children,
  className,
  description,
  disabled,
  htmlFor,
  label,
  saved,
}: {
  children?: ReactNode
  className?: string
  description?: ReactNode
  disabled?: boolean
  htmlFor?: string
  label: ReactNode
  /** Shows a short "Saved" mark beside the control. */
  saved?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5",
        className,
      )}
    >
      <div className={cn("min-w-0 flex-[1_1_220px]", disabled && "opacity-55")}>
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </label>
        ) : (
          <div className="text-sm font-medium">{label}</div>
        )}
        {description ? (
          <div className="mt-0.5 text-sm text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {children || saved ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {saved ? <SettingsSavedMark /> : null}
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function SettingsSavedMark() {
  return (
    <output className="inline-flex items-center gap-1 text-xs font-medium text-primary">
      <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
      Saved
    </output>
  )
}

/** Amber notice for something that needs the owner (limit reached, setup left). */
export function SettingsNotice({
  action,
  children,
  tone = "info",
}: {
  action?: ReactNode
  children: ReactNode
  tone?: "info" | "warning"
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[10px] border px-3.5 py-3 text-sm",
        tone === "warning"
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
          : "border-border bg-muted",
      )}
    >
      <div className="min-w-0 flex-[1_1_220px]">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
