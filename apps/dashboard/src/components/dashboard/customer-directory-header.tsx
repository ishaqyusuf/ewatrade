"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { SearchField } from "@/components/search-field"

export function CustomerDirectoryHeader({
  query,
  storeName,
  onSearch,
}: {
  query: string
  storeName: string
  onSearch: (value: string) => void
}) {
  return (
    <PageHeader
      eyebrow={storeName}
      title="Customer book"
      description="Customers and purchase history for this store."
    >
      <PageToolbar>
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
