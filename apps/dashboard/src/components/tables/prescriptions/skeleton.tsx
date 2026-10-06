"use client"

import {
  DirectoryCollectionSkeleton,
  TableSkeleton,
} from "@/components/tables/core"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { createPrescriptionColumns } from "./columns"

export function PrescriptionTableSkeleton({
  initialSettings,
  view = "table",
}: {
  initialSettings?: Partial<TableSettings>
  view?: DirectoryView
} = {}) {
  if (view !== "table")
    return <DirectoryCollectionSkeleton label="prescription requests" />
  return (
    <TableSkeleton
      columns={createPrescriptionColumns("UTC", () => {})}
      rowCount={8}
      rowHeight={57}
      stickyColumnIds={["select", "reference"]}
      columnVisibility={initialSettings?.columns}
      columnSizing={initialSettings?.sizing}
      columnOrder={initialSettings?.order}
    />
  )
}
