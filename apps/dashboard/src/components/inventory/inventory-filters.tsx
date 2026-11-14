"use client"

import { SearchField } from "@/components/search-field"
import { useInventoryParams } from "@/hooks/use-inventory-params"

/** Product search; the stock filters are the count tiles under the header. */
export function InventoryFilters() {
  const { query, setParams } = useInventoryParams()
  return (
    <SearchField
      value={query}
      placeholder="Search products"
      onSearch={(value) =>
        void setParams({ inventoryQuery: value.trim() || null })
      }
      onClear={() => void setParams({ inventoryQuery: null })}
    />
  )
}
