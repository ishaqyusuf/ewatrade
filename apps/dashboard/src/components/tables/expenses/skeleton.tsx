"use client"
import { TableSkeleton } from "@/components/tables/core"
import {
  type TableSettings,
  getColumnIds,
  normalizeTableSettings,
} from "@/utils/table-settings"
import { expenseColumns } from "./columns"
const columns = expenseColumns("NGN", "UTC", () => undefined)
export function ExpenseTableSkeleton({
  settings,
}: { settings?: Partial<TableSettings> }) {
  const normalized = normalizeTableSettings(settings, getColumnIds(columns), [
    "description",
  ])
  return (
    <TableSkeleton
      columns={columns}
      rowHeight={57}
      rowCount={8}
      columnVisibility={normalized.columns}
      columnSizing={normalized.sizing}
      columnOrder={normalized.order}
      stickyColumnIds={["select", "description"]}
    />
  )
}
