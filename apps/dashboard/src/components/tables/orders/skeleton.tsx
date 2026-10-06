"use client"

import {
  DirectoryCollectionSkeleton,
  TableSkeleton,
} from "@/components/tables/core"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { orderColumns } from "./columns"

export function OrdersTableSkeleton({
  initialSettings,
  view = "table",
}: {
  initialSettings?: Partial<TableSettings>
  view?: DirectoryView
} = {}) {
  if (view !== "table") return <DirectoryCollectionSkeleton label="orders" />
  return (
    <TableSkeleton
      columns={orderColumns()}
      rowCount={8}
      rowHeight={57}
      stickyColumnIds={["select", "orderNumber"]}
      actionsColumnId="actions"
      columnVisibility={initialSettings?.columns}
      columnSizing={initialSettings?.sizing}
      columnOrder={initialSettings?.order}
    />
  )
}
