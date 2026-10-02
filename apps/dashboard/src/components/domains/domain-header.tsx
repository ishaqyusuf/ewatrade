"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { Add01Icon, Link01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { DomainSearchFilter } from "./domain-search-filter"
import { OpenDomainSheet } from "./open-domain-sheet"

export function DomainHeader({ storeName }: { storeName: string }) {
  return (
    <PageHeader
      eyebrow={storeName}
      title="Website & domains"
      description="Buy a .com.ng or .com, or connect a domain you already own."
    >
      <PageToolbar
        actions={
          <>
            <OpenDomainSheet
              mode="connect"
              className="h-9 rounded-none"
              variant="outline"
            >
              <HugeiconsIcon icon={Link01Icon} className="mr-2 size-4" />
              Connect existing
            </OpenDomainSheet>
            <OpenDomainSheet
              mode="buy"
              aria-label="Buy domain"
              variant="outline"
              className="size-9 rounded-none"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
            </OpenDomainSheet>
          </>
        }
      >
        <DomainSearchFilter />
      </PageToolbar>
    </PageHeader>
  )
}
