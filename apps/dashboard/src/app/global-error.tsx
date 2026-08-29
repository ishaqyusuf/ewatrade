"use client"

import { captureDashboardError } from "@/observability/sentry"
import { Button } from "@ewatrade/ui"
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    captureDashboardError(error, "dashboard.global_boundary")
  }, [error])

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <main className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Workspace unavailable</h1>
          <p className="text-muted-foreground">
            We couldn&apos;t load this EwaTrade workspace. If you just completed
            an action, check its current status before repeating it.
          </p>
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </main>
      </body>
    </html>
  )
}
