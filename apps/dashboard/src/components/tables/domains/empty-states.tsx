"use client"

import { useDomainParams } from "@/hooks/use-domain-params"
import { Button } from "@ewatrade/ui"

export function DomainsEmptyState({ filtered }: { filtered: boolean }) {
  const { setParams } = useDomainParams()

  return (
    <div className="mx-auto grid max-w-md justify-items-center gap-3 text-center">
      <h2 className="font-semibold">
        {filtered ? "No matching domains" : "Give your storefront its own name"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {filtered
          ? "Try a different search."
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
