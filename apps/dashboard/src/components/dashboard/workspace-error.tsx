"use client"

import { Button } from "@ewatrade/ui"
import { useEffect } from "react"

export function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-background p-6 text-center shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">
          Workspace unavailable
        </p>
        <h1 className="mt-2 text-xl font-semibold">
          We could not load this workspace
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your data has not been changed. Try loading the workspace again.
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  )
}
