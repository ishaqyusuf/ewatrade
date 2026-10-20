"use client"

import { Button } from "@ewatrade/ui"
import { useEffect } from "react"

type ErrorProps = { error: unknown; retry: () => void }

export function WorkspaceError({
  error,
  retry,
  title = "Something went wrong",
  className = "min-h-64",
}: ErrorProps & { title?: string; className?: string }) {
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
      className={`flex flex-col items-center justify-center space-y-4 ${className}`}
    >
      <h2 className="text-base">{title}</h2>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  )
}

/** Overview sections say what failed. */
export function OverviewNumbersError(props: ErrorProps) {
  return (
    <WorkspaceError
      {...props}
      title="Couldn’t load your numbers."
      className="min-h-40 rounded-lg border border-dashed border-border"
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
