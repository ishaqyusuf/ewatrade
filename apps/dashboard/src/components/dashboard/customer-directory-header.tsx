"use client"

import { PageFab } from "@/components/page-fab/page-fab"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { SearchField } from "@/components/search-field"
import { TableToolbarSlot } from "@/components/tables/core"
import { ViewDropdown, type ViewOption } from "@/components/view-switcher"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { Button } from "@ewatrade/ui"
import {
  Add01Icon,
  GridViewIcon,
  LayoutTable01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

// The saved value stays "cards" so existing view cookies keep working.
const customerViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
  { value: "cards", label: "Grid", icon: GridViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

export function CustomerDirectoryHeader({
  query,
  storeName,
  canSeeBalances,
  onSearch,
  view,
  onViewChange,
  onAddCustomer,
}: {
  query: string
  storeName: string
  canSeeBalances: boolean
  onSearch: (value: string) => void
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
  onAddCustomer: () => void
}) {
  return (
    <PageHeader
      eyebrow={storeName}
      title="Customers"
      description={
        canSeeBalances
          ? "Your customers, their orders and what they owe."
          : "Your customers and their orders."
      }
    >
      <PageToolbar
        actions={
          <>
            <TableToolbarSlot />
            <ViewDropdown
              label="Customer view"
              value={view}
              options={customerViewOptions}
              onValueChange={onViewChange}
            />
            <Button
              aria-label="Add customer"
              title="Add customer"
              variant="outline"
              onClick={onAddCustomer}
              className="size-9 rounded-none max-sm:hidden"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
            </Button>
            <PageFab label="Add customer" onClick={onAddCustomer} />
          </>
        }
      >
        <SearchField
          className="sm:max-w-[380px]"
          placeholder="Search by name, phone or email"
          value={query}
          onSearch={onSearch}
        />
      </PageToolbar>
    </PageHeader>
  )
}
