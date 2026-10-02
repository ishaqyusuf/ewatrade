"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { CatalogAppearanceToggle } from "./catalog-appearance"
import { CatalogSearchFilter } from "./catalog-search-filter"
import { OpenCatalogItemSheet } from "./open-catalog-item-sheet"

export function CatalogHeader({ storeName }: { storeName: string }) {
  return (
    <PageHeader
      title="Catalog"
      eyebrow={storeName}
      description="Products and Services with separate stock and work behavior."
    >
      <PageToolbar
        actions={
          <>
            <CatalogAppearanceToggle />
            <OpenCatalogItemSheet />
          </>
        }
      >
        <CatalogSearchFilter />
      </PageToolbar>
    </PageHeader>
  )
}
