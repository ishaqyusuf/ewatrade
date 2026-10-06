"use client"

import {
  DirectoryCollectionSkeleton,
  TableSkeleton,
} from "@/components/tables/core"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { createStoreConversationColumns } from "./columns"

export function StoreConversationTableSkeleton({
  initialSettings,
  view = "table",
}: {
  initialSettings?: Partial<TableSettings>
  view?: DirectoryView
}) {
  if (view !== "table")
    return <DirectoryCollectionSkeleton label="conversations" />
  return (
    <TableSkeleton
      columns={createStoreConversationColumns("UTC", () => {})}
      rowCount={6}
      rowHeight={57}
      stickyColumnIds={["select", "conversation"]}
      columnVisibility={initialSettings?.columns}
      columnSizing={initialSettings?.sizing}
      columnOrder={initialSettings?.order}
    />
  )
}
