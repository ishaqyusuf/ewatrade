"use client"

import { TableSkeleton } from "@/components/tables/core"
import {
  type TableSettings,
  getColumnIds,
  normalizeTableSettings,
} from "@/utils/table-settings"
import { financeSupplierColumns } from "./columns"

const columns = financeSupplierColumns(() => undefined)

export function FinanceSupplierTableSkeleton({
  settings,
}: {
  settings?: Partial<TableSettings>
}) {
  const normalized = normalizeTableSettings(settings, getColumnIds(columns), [
    "code",
  ])

  return (
    <TableSkeleton
      columns={columns}
      rowHeight={57}
      rowCount={8}
      columnVisibility={normalized.columns}
      columnSizing={normalized.sizing}
      columnOrder={normalized.order}
      stickyColumnIds={["code"]}
    />
  )
}
