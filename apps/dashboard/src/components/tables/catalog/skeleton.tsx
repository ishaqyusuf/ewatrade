"use client"

import { TableSkeleton } from "@/components/tables/core"
import type { TableSettings } from "@/utils/table-settings"
import { useMemo } from "react"
import { createCatalogColumns } from "./columns"

export function CatalogTableSkeleton({
  settings,
}: {
  settings?: Partial<TableSettings>
}) {
  const columns = useMemo(() => createCatalogColumns(() => {}), [])
  return (
    <TableSkeleton
      columns={columns}
      rowCount={10}
      rowHeight={57}
      columnVisibility={settings?.columns}
      columnSizing={settings?.sizing}
      columnOrder={settings?.order}
      stickyColumnIds={["item"]}
      actionsColumnId="actions"
    />
  )
}
