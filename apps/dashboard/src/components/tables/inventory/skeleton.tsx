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
    <div className="grid gap-6">
      <div
        aria-label="Loading inventory summary"
        className="grid h-32 grid-cols-3 divide-x divide-border border border-border"
      >
        {[0, 1, 2].map((id) => (
          <div
            key={id}
            className="m-5 animate-pulse bg-muted motion-reduce:animate-none"
          />
        ))}
      </div>
      {view !== "table" ? (
        <DirectoryCollectionSkeleton label="inventory balances" />
      ) : (
        <TableSkeleton
          columns={inventoryColumns}
          rowCount={10}
          rowHeight={57}
          columnVisibility={settings?.columns}
          columnSizing={settings?.sizing}
          columnOrder={settings?.order}
          stickyColumnIds={["select", "product", "actions"]}
        />
      )}
    </div>
  )
}
