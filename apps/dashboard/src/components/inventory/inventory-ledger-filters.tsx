"use client"
import { SearchField } from "@/components/search-field"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import { FilterPills } from "./filter-pills"

export function InventoryLedgerSearch({
  placeholder,
}: { placeholder: string }) {
  const { params, setParams } = useInventoryLedgerParams()
  return (
    <SearchField
      value={params.q ?? ""}
      placeholder={placeholder}
      onSearch={(q) => void setParams({ q: q.trim() || null })}
      onClear={() => void setParams({ q: null })}
    />
  )
}

export function InventoryLedgerFilters({
  label,
  filters,
}: { label: string; filters: { id: string; label: string }[] }) {
  const { params, setParams } = useInventoryLedgerParams()
  return (
    <FilterPills
      label={label}
      options={filters}
      value={params.filter ?? "all"}
      onChange={(id) => void setParams({ filter: id === "all" ? null : id })}
    />
  )
}
