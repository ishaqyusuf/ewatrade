"use client"

import { setTemplateUpdatePreference } from "@/app/(studio)/storefront/updates/actions"
import { clearDashboardDataCache } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useState } from "react"

export function TemplateUpdateControls({
  tenantId,
  emailEnabled,
}: { tenantId: string; emailEnabled: boolean }) {
  const [enabled, setEnabled] = useState(emailEnabled)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function openStudio() {
    setBusy(true)
    setError("")
    try {
      // Existing authenticated POST rechecks membership and selects this business.
      const result = await fetch("/api/tenants/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, path: "/storefront" }),
      })
      if (!result.ok)
        throw Error(
          "This business is no longer available. Refresh and try again.",
        )
      clearDashboardDataCache()
      window.location.assign("/storefront")
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open Studio.",
      )
      setBusy(false)
    }
  }
  async function toggleEmails() {
    setBusy(true)
    setError("")
    try {
      await setTemplateUpdatePreference(tenantId, !enabled)
      setEnabled(!enabled)
    } catch {
      setError("Could not save your email preference. Refresh and try again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-5">
      <Button onClick={openStudio} disabled={busy}>
        Open Storefront Studio
      </Button>
      <div className="border-t border-border pt-5 text-sm">
        <p>
          Template update emails for you at this business are{" "}
          {enabled ? "on" : "off"}.
        </p>
        <Button
          className="mt-2"
          variant="outline"
          onClick={toggleEmails}
          disabled={busy}
        >
          {enabled ? "Turn off these emails" : "Turn on these emails"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
