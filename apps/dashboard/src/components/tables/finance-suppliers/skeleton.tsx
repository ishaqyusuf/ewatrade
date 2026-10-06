"use client"

import {
  DirectoryCollectionSkeleton,
  TableSkeleton,
} from "@/components/tables/core"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  type TableSettings,
  getColumnIds,
  normalizeTableSettings,
} from "@/utils/table-settings"
import { financeSupplierColumns } from "./columns"

const columns = financeSupplierColumns(() => undefined)

export function FinanceSupplierTableSkeleton({
  settings,
  view = "table",
}: {
  settings?: Partial<TableSettings>
  view?: DirectoryView
}) {
  const normalized = normalizeTableSettings(settings, getColumnIds(columns), [
    "select",
    "code",
  ])
  if (view !== "table") return <DirectoryCollectionSkeleton label="suppliers" />

  return (
    <TableSkeleton
      columns={columns}
      rowHeight={57}
      rowCount={8}
      columnVisibility={normalized.columns}
      columnSizing={normalized.sizing}
      columnOrder={normalized.order}
      stickyColumnIds={["select", "code"]}
    />
  )
}
