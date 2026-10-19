"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { CatalogToolbarSlot } from "@/components/tables/catalog/toolbar-slot"
import { ViewDropdown, type ViewOption } from "@/components/view-switcher"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  GridViewIcon,
  LayoutTable01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import { CatalogSearchFilter } from "./catalog-search-filter"
import { OpenCatalogItemSheet } from "./open-catalog-item-sheet"

// The saved value stays "cards" so existing view cookies keep working.
const catalogViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
  { value: "cards", label: "Grid", icon: GridViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

export function CatalogHeader({
  storeName,
  view,
  onViewChange,
}: {
  storeName: string
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
}) {
  return (
    <PageHeader
      title="Catalog"
      eyebrow={storeName}
      description="Products and Services with separate stock and work behavior."
    >
      <PageToolbar
        actions={
          <>
            <CatalogToolbarSlot />
            <ViewDropdown
              label="Catalog view"
              value={view}
              options={catalogViewOptions}
              onValueChange={onViewChange}
            />
            <OpenCatalogItemSheet />
          </>
        }
      >
        <CatalogSearchFilter />
      </PageToolbar>
    </PageHeader>
  )
}
