"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { Add01Icon, Link01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { DomainSearchFilter } from "./domain-search-filter"
import { OpenDomainSheet } from "./open-domain-sheet"

export function DomainHeader({
  storeName,
  view,
  onViewChange,
}: {
  storeName: string
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
}) {
  return (
    <PageHeader
      eyebrow={storeName}
      title="Website & domains"
      description="Buy a .com.ng or .com, or connect a domain you already own."
    >
      <PageToolbar
        actions={
          <>
            <ViewSwitcher
              label="Domain view"
              value={view}
              options={directoryViewOptions}
              onValueChange={onViewChange}
            />
            <OpenDomainSheet
              mode="connect"
              className="h-9 rounded-md"
              variant="outline"
            >
              <HugeiconsIcon icon={Link01Icon} className="mr-2 size-4" />
              Connect existing
            </OpenDomainSheet>
            <OpenDomainSheet
              mode="buy"
              aria-label="Buy domain"
              variant="outline"
              className="size-9 rounded-md"
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
