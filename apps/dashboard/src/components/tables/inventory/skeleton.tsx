"use client"

import {
  DirectoryCollectionSkeleton,
  TableSkeleton,
} from "@/components/tables/core"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { inventoryColumns } from "./columns"

export function InventoryTableSkeleton({
  settings,
  view = "table",
}: {
  settings?: Partial<TableSettings>
  view?: DirectoryView
} = {}) {
  return (
    <div className="grid gap-4">
      <div
        aria-label="Loading stock counts"
        className="grid grid-cols-2 gap-2 lg:grid-cols-4"
      >
        {[0, 1, 2, 3].map((id) => (
          <div
            key={id}
            className="h-[4.75rem] animate-pulse rounded-[var(--ui-radius-surface)] bg-muted motion-reduce:animate-none"
          />
        ))}
      </div>
      {view !== "table" ? (
        <DirectoryCollectionSkeleton label="stock" />
      ) : (
        <TableSkeleton
          columns={inventoryColumns}
          rowCount={10}
          rowHeight={57}
          columnVisibility={settings?.columns}
          columnSizing={settings?.sizing}
          columnOrder={settings?.order}
          stickyColumnIds={["product", "actions"]}
        />
      )}
    </div>
  )
}
