"use client"

import { TableSkeleton } from "@/components/tables/core"
import type {
  ColumnOrderState,
  ColumnSizingState,
  VisibilityState,
} from "@tanstack/react-table"
import { customerColumns } from "./columns"

export function CustomerTableSkeleton({
  currencyCode,
  columnVisibility,
  columnSizing,
  columnOrder,
}: {
  currencyCode: string
  columnVisibility?: VisibilityState
  columnSizing?: ColumnSizingState
  columnOrder?: ColumnOrderState
}) {
  const columns = customerColumns(currencyCode)
  return (
    <TableSkeleton
      columns={columns}
      rowCount={6}
      rowHeight={57}
      stickyColumnIds={["select", "name"]}
      columnVisibility={columnVisibility}
      columnSizing={columnSizing}
      columnOrder={columnOrder}
    />
  )
}
