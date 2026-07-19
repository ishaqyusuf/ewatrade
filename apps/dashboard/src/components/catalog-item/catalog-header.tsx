"use client"

import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { OpenCatalogItemSheet } from "./open-catalog-item-sheet"

export function CatalogHeader({ storeName }: { storeName: string }) {
  const { catalogKind, catalogQuery, setParams } = useCatalogItemParams()

  return (
    <header className="grid gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{storeName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Catalog
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Products and Services with separate stock and work behavior.
          </p>
        </div>
        <OpenCatalogItemSheet />
      </div>
      <div className="flex max-w-2xl flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search Catalog</span>
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Search items"
            value={catalogQuery}
            onChange={(event) =>
              setParams({ catalogQuery: event.target.value || null })
            }
          />
        </label>
        <select
          aria-label="Item type"
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-40"
          value={catalogKind ?? ""}
          onChange={(event) =>
            setParams({
              catalogKind:
                event.target.value === "product" ||
                event.target.value === "service"
                  ? event.target.value
                  : null,
            })
          }
        >
          <option value="">All items</option>
          <option value="product">Products</option>
          <option value="service">Services</option>
        </select>
      </div>
    </header>
  )
}
