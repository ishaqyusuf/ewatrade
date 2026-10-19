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
  canSeeBalances,
  columnVisibility,
  columnSizing,
  columnOrder,
}: {
  currencyCode: string
  canSeeBalances: boolean
  columnVisibility?: VisibilityState
  columnSizing?: ColumnSizingState
  columnOrder?: ColumnOrderState
}) {
  const columns = customerColumns({
    currencyCode,
    canSeeBalances,
    onEdit: () => undefined,
  })
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
