"use client"

import { SearchField } from "@/components/search-field"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { Button } from "@ewatrade/ui"

const filters = [
  { id: "all", label: "All balances" },
  { id: "reserved", label: "Reserved" },
  { id: "out", label: "Out of stock" },
] as const

export function InventoryFilters() {
  const { query, stockFilter, setParams } = useInventoryParams()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SearchField
        value={query}
        placeholder="Search product, variant, unit, or custody..."
        onSearch={(value) =>
          void setParams({ inventoryQuery: value.trim() || null })
        }
        onClear={() => void setParams({ inventoryQuery: null })}
      />
      <div className="flex flex-wrap gap-1" aria-label="Stock filters">
        {filters.map((filter) => (
          <Button
            key={filter.id}
            variant={stockFilter === filter.id ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={stockFilter === filter.id}
            onClick={() =>
              void setParams({
                inventoryFilter: filter.id === "all" ? null : filter.id,
              })
            }
          >
            {filter.label}
          </Button>
        ))}
        {query || stockFilter !== "all" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void setParams({ inventoryFilter: null, inventoryQuery: null })
            }
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  )
}
