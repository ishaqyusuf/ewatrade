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
    <TableSkeleton
      columns={inventoryColumns}
      rowCount={10}
      rowHeight={57}
      columnVisibility={settings?.columns}
      columnSizing={settings?.sizing}
      columnOrder={settings?.order}
      stickyColumnIds={["product"]}
    />
  )
}
