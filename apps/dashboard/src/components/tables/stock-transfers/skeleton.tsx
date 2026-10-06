"use client"
import { TableSkeleton } from "@/components/tables/core"
import type { TableSettings } from "@/utils/table-settings"
import { transferColumns } from "./columns"
const columns = transferColumns(() => {})
export function TransfersSkeleton({
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
