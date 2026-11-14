"use client"
import {
  DirectoryCollectionSkeleton,
  TableSkeleton,
} from "@/components/tables/core"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { transferColumns } from "./columns"
const columns = transferColumns()
export function TransfersSkeleton({
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
      stickyColumnIds={["identity"]}
    />
  )
}
