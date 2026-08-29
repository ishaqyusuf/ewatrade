"use client"

import { captureMarketingError } from "@/observability/sentry"
import { Button } from "@ewatrade/ui"
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(
    () => captureMarketingError(error, "marketing.global_boundary"),
    [error],
  )
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <main className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">
            Page temporarily unavailable
          </h1>
          <p className="text-muted-foreground">
            We couldn&apos;t load this EwaTrade page. Please try again.
          </p>
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </main>
      </body>
    </html>
  )
}
