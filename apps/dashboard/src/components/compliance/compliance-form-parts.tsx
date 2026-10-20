"use client"

import { cn } from "@/utils"
import { Button, SubmitButton } from "@ewatrade/ui"
import type { ReactNode } from "react"

/** A written field inside a settings card: label and help above a full-width control. */
export function ComplianceField({
  children,
  className,
  error,
  errorId,
  help,
  helpId,
  htmlFor,
  label,
}: {
  children: ReactNode
  className?: string
  error?: string | null
  errorId?: string
  help?: ReactNode
  helpId?: string
  htmlFor: string
  label: ReactNode
}) {
  return (
    <div className={cn("grid min-w-0 gap-1.5 px-4 py-3.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {help ? (
        <p id={helpId} className="-mt-1 text-sm text-muted-foreground">
          {help}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Cancel and Save for written settings, shown only once something changed. */
export function ComplianceSaveRow({
  error,
  isSaving,
  message,
  onCancel,
  saveLabel = "Save",
  sticky,
}: {
  error?: string | null
  isSaving: boolean
  message?: ReactNode
  onCancel?: () => void
  saveLabel?: string
  sticky?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3",
        sticky &&
          "sticky bottom-4 z-10 rounded-[10px] border border-border bg-card shadow-md",
      )}
    >
      <div className="min-w-0 flex-[1_1_220px] text-sm">
        {message ? <p className="text-muted-foreground">{message}</p> : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {onCancel ? (
          <Button
            disabled={isSaving}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        ) : null}
        <SubmitButton isSubmitting={isSaving} size="sm">
          {saveLabel}
        </SubmitButton>
      </div>
    </div>
  )
}

/** Turns "2555" days into "About 7 years" so long retention reads plainly. */
export function describeDays(days: number) {
  if (!Number.isFinite(days) || days < 1) return null
  if (days >= 365) {
    const years = Math.round(days / 365)
    return `About ${years} ${years === 1 ? "year" : "years"}`
  }
  if (days >= 60) {
    const months = Math.round(days / 30)
    return `About ${months} months`
  }
  return null
}
