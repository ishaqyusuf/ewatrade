"use client"

import { TableSkeleton } from "@/components/tables/core"
import type { TableSettings } from "@/utils/table-settings"
import { createStoreConversationColumns } from "./columns"

export function StoreConversationTableSkeleton({
  initialSettings,
}: {
  initialSettings?: Partial<TableSettings>
}) {
  return (
    <TableSkeleton
      columns={createStoreConversationColumns("UTC", () => {})}
      rowCount={6}
      rowHeight={57}
      stickyColumnIds={["conversation"]}
      columnVisibility={initialSettings?.columns}
      columnSizing={initialSettings?.sizing}
      columnOrder={initialSettings?.order}
    />
  )
}
