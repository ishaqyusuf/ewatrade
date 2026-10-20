"use client"

import { Button } from "@ewatrade/ui"
import { useEffect } from "react"

export function WorkspaceError({
  error,
  retry,
}: {
  error: unknown
  retry: () => void
}) {
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
    <div className="flex min-h-64 flex-col items-center justify-center space-y-4">
      <h2 className="text-base">Something went wrong</h2>
      <Button appearance="form" variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  )
}
