"use client"

import { TableSkeleton } from "@/components/tables/core"
import type { TableSettings } from "@/utils/table-settings"
import { createPrescriptionColumns } from "./columns"

export function PrescriptionTableSkeleton({
  initialSettings,
}: {
  initialSettings?: Partial<TableSettings>
} = {}) {
  return (
    <TableSkeleton
      columns={createPrescriptionColumns("UTC", () => {})}
      rowCount={8}
      rowHeight={57}
      stickyColumnIds={["reference"]}
      columnVisibility={initialSettings?.columns}
      columnSizing={initialSettings?.sizing}
      columnOrder={initialSettings?.order}
    />
  )
}
