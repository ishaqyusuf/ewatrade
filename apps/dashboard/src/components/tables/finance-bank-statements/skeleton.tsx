"use client"

import { TableSkeleton } from "@/components/tables/core"
import {
  type TableSettings,
  getColumnIds,
  normalizeTableSettings,
} from "@/utils/table-settings"
import { financeBankStatementColumns } from "./columns"

const columns = financeBankStatementColumns(null, () => undefined)

export function FinanceBankStatementTableSkeleton({
  settings,
}: {
  settings?: Partial<TableSettings>
}) {
  const normalized = normalizeTableSettings(settings, getColumnIds(columns), [
    "reference",
  ])

  return (
    <TableSkeleton
      columns={columns}
      rowHeight={57}
      rowCount={8}
      columnVisibility={normalized.columns}
      columnSizing={normalized.sizing}
      columnOrder={normalized.order}
      stickyColumnIds={["reference"]}
    />
  )
}
