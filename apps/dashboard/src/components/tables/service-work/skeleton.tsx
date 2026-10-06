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
import { createServiceWorkColumns } from "./columns"
export function ServiceWorkTableSkeleton({
  initialSettings,
  view = "table",
}: { initialSettings?: Partial<TableSettings>; view?: DirectoryView }) {
  const columns = createServiceWorkColumns(() => undefined, "UTC")
  const normalized = normalizeTableSettings(
    initialSettings,
    getColumnIds(columns),
    ["select", "order"],
  )
  if (view !== "table") return <DirectoryCollectionSkeleton label="jobs" />
  return (
    <TableSkeleton
      columns={columns}
      rowHeight={57}
      rowCount={8}
      columnVisibility={normalized.columns}
      columnSizing={normalized.sizing}
      columnOrder={normalized.order}
      stickyColumnIds={["select", "order"]}
    />
  )
}
