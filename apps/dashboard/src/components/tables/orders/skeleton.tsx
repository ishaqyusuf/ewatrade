"use client"

import { TableSkeleton } from "@/components/tables/core"
import type { TableSettings } from "@/utils/table-settings"
import { orderColumns } from "./columns"

export function OrdersTableSkeleton({
  initialSettings,
}: {
  initialSettings?: Partial<TableSettings>
} = {}) {
  return (
    <TableSkeleton
      columns={orderColumns()}
      rowCount={8}
      rowHeight={57}
      stickyColumnIds={["orderNumber"]}
      columnVisibility={initialSettings?.columns}
      columnSizing={initialSettings?.sizing}
      columnOrder={initialSettings?.order}
    />
  )
}
