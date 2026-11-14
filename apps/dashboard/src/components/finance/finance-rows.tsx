"use client"
import { cn } from "@/utils"
import type { ReactNode } from "react"

/**
 * Finance lists on phones and the Overview panels: one tappable row per
 * record, name and a short line on the left, the amount (and a status) on the
 * right. Whole row opens the record.
 */
export function FinanceRowList({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <ul
      aria-label={label}
      className={cn(
        "min-w-0 divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card",
        className,
      )}
    >
      {children}
    </ul>
  )
}

export function FinanceRow({
  title,
  subtitle,
  amount,
  aside,
  onOpen,
  inset = false,
}: {
  title: ReactNode
  subtitle?: ReactNode
  amount?: ReactNode
  /** A status pill under (phones) or beside (wider) the amount. */
  aside?: ReactNode
  onOpen?: () => void
  /** Indent a row that belongs to the row above it. */
  inset?: boolean
}) {
  const body = (
    <>
      <span className={cn("grid min-w-0 gap-0.5 text-left", inset && "pl-3")}>
        <span className={cn("truncate", inset ? "font-normal" : "font-medium")}>
          {title}
        </span>
        {subtitle ? (
          <span className="truncate text-sm text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
      {amount || aside ? (
        <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
          {amount ? (
            <span className="font-semibold tabular-nums">{amount}</span>
          ) : null}
          {aside}
        </span>
      ) : null}
    </>
  )
  const row =
    "flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2.5"
  return (
    <li className="min-w-0">
      {onOpen ? (
        <button
          type="button"
          className={cn(
            row,
            "transition-colors hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]",
          )}
          onClick={onOpen}
        >
          {body}
        </button>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  )
}
