"use client"

import { useDomainParams } from "@/hooks/use-domain-params"
import { Button } from "@ewatrade/ui"
import { Add01Icon, Link01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { DomainSearchFilter } from "./domain-search-filter"

export function DomainHeader({ storeName }: { storeName: string }) {
  const { setParams } = useDomainParams()

  return (
    <header className="grid gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{storeName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Website & domains
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Buy a .com.ng or .com, or connect a domain you already own.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setParams({ domainMode: "connect" })}
          >
            <HugeiconsIcon icon={Link01Icon} className="mr-2 size-4" />
            Connect existing
          </Button>
          <Button onClick={() => setParams({ domainMode: "buy" })}>
            <HugeiconsIcon icon={Add01Icon} className="mr-2 size-4" />
            Buy domain
          </Button>
        </div>
      </div>
      <DomainSearchFilter />
    </header>
  )
}
