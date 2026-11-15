"use client"

import { AuthShell } from "@/components/auth/auth-shell"
import { captureDashboardError } from "@/observability/sentry"
import { Button } from "@ewatrade/ui"
import { useEffect } from "react"

/** Errors on public pages (links, payment, sign in) under the root layout. */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    captureDashboardError(error, "dashboard.root_boundary")
  }, [error])

  return (
    <AuthShell
      title="Something went wrong"
      description="If you just saved something, check it before trying again."
    >
      <Button className="w-full" onClick={retry}>
        Try again
      </Button>
    </AuthShell>
  )
}
