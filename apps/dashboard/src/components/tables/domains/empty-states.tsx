"use client"
import { useDashboardEmptyState } from "@ewatrade/events/dashboard-client"

import { useDomainParams } from "@/hooks/use-domain-params"
import { Button } from "@ewatrade/ui"

export function DomainsEmptyState({ filtered }: { filtered: boolean }) {
  useDashboardEmptyState("domains")
  const { setParams } = useDomainParams()

  return (
    <div className="mx-auto grid max-w-md justify-items-center gap-3 text-center">
      <h2 className="font-semibold">
        {filtered ? "No domains match" : "Get your own web address"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {filtered
          ? "Try a different search or clear the filters."
          : "Buy a local .com.ng, a global .com, or connect one you already own."}
      </p>
      {!filtered ? (
        <Button onClick={() => setParams({ domainMode: "buy" })}>
          Buy your first domain
        </Button>
      ) : null}
    </div>
  )
}
