"use client"

import { TableSkeleton } from "@/components/tables/core"
import type { TableSettings } from "@/utils/table-settings"
import { inventoryColumns } from "./columns"

export function InventoryTableSkeleton({
  settings,
}: {
  settings?: Partial<TableSettings>
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
      <TableSkeleton
        columns={inventoryColumns}
        rowCount={10}
        rowHeight={57}
        columnVisibility={settings?.columns}
        columnSizing={settings?.sizing}
        columnOrder={settings?.order}
        stickyColumnIds={["product", "actions"]}
      />
    </div>
  )
}
