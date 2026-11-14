"use client"

import { useInventoryParams } from "@/hooks/use-inventory-params"
import type { InventoryStockFilter } from "@/lib/inventory-view"
import { cn } from "@/utils"

const tiles: ReadonlyArray<{
  id: InventoryStockFilter
  label: string
  tone?: string
}> = [
  { id: "all", label: "All stock" },
  { id: "low", label: "Running low", tone: "text-warning-foreground" },
  { id: "out", label: "Out of stock", tone: "text-danger-foreground" },
  { id: "reserved", label: "Held for orders" },
]

/**
 * The stock filters, each showing how many lines it holds. Picking a tile
 * filters the list, so the count and the rows below always agree.
 */
export function InventorySummary({
  counts,
}: {
  counts: Record<InventoryStockFilter, number>
}) {
  const { stockFilter, setParams } = useInventoryParams()
  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-2 border-0 p-0 lg:grid-cols-4">
      <legend className="sr-only">Show stock</legend>
      {tiles.map((tile) => {
        const active = stockFilter === tile.id
        const count = counts[tile.id]
        return (
          <button
            key={tile.id}
            type="button"
            aria-pressed={active}
            data-stock-filter={tile.id}
            onClick={() =>
              void setParams({
                inventoryFilter: tile.id === "all" ? null : tile.id,
              })
            }
            className={cn(
              "flex min-h-[4.75rem] min-w-0 flex-col items-start justify-between gap-1 rounded-[var(--ui-radius-surface)] border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-[var(--hover)]",
              active && "border-foreground ring-1 ring-foreground",
            )}
          >
            <span className="truncate text-sm text-muted-foreground">
              {tile.label}
            </span>
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                count > 0 && tile.tone,
              )}
            >
              {count}
            </span>
          </button>
        )
      })}
    </fieldset>
  )
}
