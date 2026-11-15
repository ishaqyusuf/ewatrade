"use client"

import "@ewatrade/ui/globals.css"
import "@/styles/dashboard.css"
import { AuthShell } from "@/components/auth/auth-shell"
import { captureDashboardError } from "@/observability/sentry"
import { Button } from "@ewatrade/ui"
import { useEffect } from "react"

/** Replaces the root layout when it fails, so it brings its own styles. */
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
    <html lang="en" className="ewatrade-dashboard">
      <body className="bg-background font-sans antialiased">
        <AuthShell
          title="Something went wrong"
          description="If you just saved something, check it before trying again."
        >
          <Button className="w-full" onClick={reset}>
            Try again
          </Button>
        </AuthShell>
      </body>
    </html>
  )
}
