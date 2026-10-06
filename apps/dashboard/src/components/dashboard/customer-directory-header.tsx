"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { SearchField } from "@/components/search-field"
import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
import type { DirectoryView } from "@/utils/directory-view-settings"

export function CustomerDirectoryHeader({
  query,
  storeName,
  onSearch,
  view,
  onViewChange,
}: {
  query: string
  storeName: string
  onSearch: (value: string) => void
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
}) {
  return (
    <PageHeader
      eyebrow={storeName}
      title="Customer book"
      description="Customers and purchase history for this store."
    >
      <PageToolbar
        actions={
          <ViewSwitcher
            label="Customer view"
            value={view}
            options={directoryViewOptions}
            onValueChange={onViewChange}
          />
        }
      >
        <SearchField
          className="sm:max-w-[380px]"
          placeholder="Search customers"
          value={query}
          onSearch={onSearch}
        />
      </PageToolbar>
    </PageHeader>
  )
}
