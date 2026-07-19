"use client"

import {
  type InventoryOperationMode,
  useInventoryParams,
} from "@/hooks/use-inventory-params"
import { Button } from "@ewatrade/ui"
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const operations: Array<{
  label: string
  mode: InventoryOperationMode
}> = [
  { label: "Receive", mode: "receipt" },
  { label: "Count", mode: "count" },
  { label: "Adjust", mode: "adjustment" },
  { label: "Transform", mode: "transformation" },
  { label: "Custody", mode: "custody" },
  { label: "Transfer", mode: "transfer" },
]

export function InventoryHeader({ storeName }: { storeName: string }) {
  const { query, setParams } = useInventoryParams()

  return (
    <header className="grid gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{storeName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Exact physical balances and immutable stock operations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {operations.map((operation) => (
            <Button
              key={operation.mode}
              size="sm"
              variant={operation.mode === "receipt" ? "default" : "outline"}
              onClick={() => setParams({ inventoryOperation: operation.mode })}
            >
              <HugeiconsIcon icon={Add01Icon} className="mr-2 size-4" />
              {operation.label}
            </Button>
          ))}
        </div>
      </div>
      <label className="relative max-w-xl">
        <span className="sr-only">Search inventory</span>
        <HugeiconsIcon
          icon={Search01Icon}
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Search Product, variant, unit, or custody"
          value={query}
          onChange={(event) =>
            setParams({ inventoryQuery: event.target.value || null })
          }
        />
      </label>
    </header>
  )
}
