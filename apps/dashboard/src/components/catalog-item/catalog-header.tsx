"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { CatalogSearchFilter } from "./catalog-search-filter"
import { OpenCatalogItemSheet } from "./open-catalog-item-sheet"

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
            <ViewSwitcher
              label="Catalog view"
              value={view}
              options={directoryViewOptions}
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
