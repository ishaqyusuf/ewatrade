"use client"
import { SearchField } from "@/components/search-field"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import { Button } from "@ewatrade/ui"
export function InventoryLedgerFilters({
  placeholder,
  filters,
}: { placeholder: string; filters: { id: string; label: string }[] }) {
  const { params, setParams } = useInventoryLedgerParams()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SearchField
        value={params.q ?? ""}
        placeholder={placeholder}
        onSearch={(q) => void setParams({ q: q.trim() || null })}
        onClear={() => void setParams({ q: null })}
      />
      <div className="flex flex-wrap gap-1" aria-label="Record filters">
        {filters.map((filter) => (
          <Button
            key={filter.id}
            variant={
              (params.filter ?? "all") === filter.id ? "secondary" : "ghost"
            }
            size="sm"
            className="rounded-none"
            aria-pressed={(params.filter ?? "all") === filter.id}
            onClick={() =>
              void setParams({ filter: filter.id === "all" ? null : filter.id })
            }
          >
            {filter.label}
          </Button>
        ))}
        {params.q || params.filter ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void setParams({ q: null, filter: null })}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  )
}
