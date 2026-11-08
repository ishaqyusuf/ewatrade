"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { TableToolbarSlot } from "@/components/tables/core"
import { ViewDropdown, type ViewOption } from "@/components/view-switcher"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  GridViewIcon,
  LayoutTable01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import { CatalogSearchFilter } from "./catalog-search-filter"
import { OpenCatalogItemSheet } from "./open-catalog-item-sheet"
import { OpenMyImages } from "./open-my-images"

// The saved value stays "cards" so existing view cookies keep working.
const catalogViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
  { value: "cards", label: "Grid", icon: GridViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

export function CatalogHeader({
  storeId,
  storeName,
  view,
  onViewChange,
}: {
  storeId: string
  storeName: string
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
}) {
  return (
    <PageHeader
      title="Catalog"
      eyebrow={storeName}
      description="Goods and services you offer."
    >
      <PageToolbar
        actions={
          <>
            <TableToolbarSlot />
            <ViewDropdown
              label="Catalog view"
              value={view}
              options={catalogViewOptions}
              onValueChange={onViewChange}
            />
            <OpenMyImages storeId={storeId} />
            <OpenCatalogItemSheet />
          </>
        }
      >
        <CatalogSearchFilter />
      </PageToolbar>
    </PageHeader>
  )
}
