"use client"
import { TableSkeleton } from "@/components/tables/core"
import {
  type TableSettings,
  getColumnIds,
  normalizeTableSettings,
} from "@/utils/table-settings"
import { createServiceWorkColumns } from "./columns"
export function ServiceWorkTableSkeleton({
  initialSettings,
  canManage = false,
}: { initialSettings?: Partial<TableSettings>; canManage?: boolean }) {
  const columns = createServiceWorkColumns(() => undefined, "UTC", canManage)
  const normalized = normalizeTableSettings(
    initialSettings,
    getColumnIds(columns),
    ["order"],
  )
  return (
    <TableSkeleton
      columns={columns}
      rowHeight={57}
      rowCount={8}
      columnVisibility={normalized.columns}
      columnSizing={normalized.sizing}
      columnOrder={normalized.order}
      stickyColumnIds={canManage ? ["select", "order"] : ["order"]}
    />
  )
}
