"use client"

import { Button } from "@ewatrade/ui"
import { useEffect } from "react"

type ErrorProps = { error: unknown; retry: () => void }

/**
 * The shell's error state (route error.tsx, sheets, modals, page sections):
 * a short title, one line, and Try again.
 */
export function WorkspaceError({
  error,
  retry,
  title = "Couldn’t load this",
  detail = "Check your connection and try again.",
  className = "min-h-64",
}: ErrorProps & { title?: string; detail?: string; className?: string }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error(
        error instanceof Error
          ? { message: error.message, name: error.name }
          : "Workspace error",
      )
    }
  }, [error])

  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-4 px-4 text-center ${className}`}
    >
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {detail ? <p className="text-muted-foreground">{detail}</p> : null}
      </div>
      <Button onClick={retry}>Try again</Button>
    </div>
  )
}

/** Overview sections say what failed. */
export function OverviewNumbersError(props: ErrorProps) {
  return (
    <WorkspaceError
      {...props}
      title="Couldn’t load your numbers."
      className="min-h-40 rounded-[var(--ui-radius-surface)] border border-dashed border-border"
    />
  )
}

export function OverviewOrdersError(props: ErrorProps) {
  return (
    <WorkspaceError
      {...props}
      title="Couldn’t load recent orders."
      className="min-h-40"
    />
  )
}
