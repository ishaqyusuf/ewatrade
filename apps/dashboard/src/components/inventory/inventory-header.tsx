"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { TableToolbarSlot } from "@/components/tables/core"
import { ViewDropdown, type ViewOption } from "@/components/view-switcher"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  GridViewIcon,
  LayoutTable01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import { InventoryFilters } from "./inventory-filters"
import { InventoryOperationMenu } from "./inventory-operation-menu"
import { InventoryTabs } from "./inventory-tabs"

// The saved value stays "cards" so existing view cookies keep working.
export const inventoryViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
  { value: "cards", label: "Grid", icon: GridViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

export const inventoryHistoryViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

export function InventoryHeader({
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
      title="Inventory"
      description="What you have in each store and what you can sell."
    >
      <PageToolbar
        actions={
          <>
            <TableToolbarSlot />
            <ViewDropdown
              label="Inventory view"
              value={view}
              options={inventoryViewOptions}
              onValueChange={onViewChange}
            />
            <InventoryOperationMenu />
          </>
        }
      >
        <InventoryFilters />
      </PageToolbar>
      <InventoryTabs />
    </PageHeader>
  )
}
