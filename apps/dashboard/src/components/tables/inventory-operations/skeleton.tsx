"use client"
import {
  DirectoryCollectionSkeleton,
  TableSkeleton,
  selectColumn,
} from "@/components/tables/core"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { type InventoryOperation, operationColumns } from "./columns"
const columns = [
  selectColumn<InventoryOperation>(() => ""),
  ...operationColumns(() => {}),
]
export function OperationsSkeleton({
  settings,
  view = "table",
}: { settings?: Partial<TableSettings>; view?: DirectoryView }) {
  if (view !== "table") return <DirectoryCollectionSkeleton label="records" />
  return (
    <TableSkeleton
      columns={columns}
      rowCount={10}
      rowHeight={57}
      columnVisibility={settings?.columns}
      columnSizing={settings?.sizing}
      columnOrder={settings?.order}
      stickyColumnIds={["select", "identity", "actions"]}
    />
  )
}
