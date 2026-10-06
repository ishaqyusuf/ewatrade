"use client"
import { TableSkeleton } from "@/components/tables/core"
import type { TableSettings } from "@/utils/table-settings"
import { operationColumns } from "./columns"
const columns = operationColumns(() => {})
export function OperationsSkeleton({
  settings,
}: { settings?: Partial<TableSettings> }) {
  return (
    <TableSkeleton
      columns={columns}
      rowCount={10}
      rowHeight={57}
      columnVisibility={settings?.columns}
      columnSizing={settings?.sizing}
      columnOrder={settings?.order}
      stickyColumnIds={["identity", "actions"]}
    />
  )
}
