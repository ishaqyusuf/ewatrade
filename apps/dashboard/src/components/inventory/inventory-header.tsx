"use client"

import { PageHeader } from "@/components/page-header"
import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { InventoryOperationMenu } from "./inventory-operation-menu"

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
    <div className="flex flex-wrap items-center justify-between gap-4">
      <PageHeader
        eyebrow={storeName}
        title="Inventory"
        description="Know what’s on hand and ready to sell."
      />
      <div className="flex flex-wrap items-center gap-2">
        <ViewSwitcher
          label="Inventory view"
          value={view}
          options={directoryViewOptions}
          onValueChange={onViewChange}
        />
        <InventoryOperationMenu />
      </div>
    </div>
  )
}
