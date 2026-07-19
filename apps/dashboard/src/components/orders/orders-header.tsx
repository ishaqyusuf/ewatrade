"use client"

import { useOrderParams } from "@/hooks/use-order-params"
import { Button } from "@ewatrade/ui"
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function OrdersHeader({ storeName }: { storeName: string }) {
  const { query, setParams } = useOrderParams()

  return (
    <header className="grid gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{storeName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Products and Services share one immutable order record.
          </p>
        </div>
        <Button onClick={() => setParams({ orderSheet: "create" })}>
          <HugeiconsIcon icon={Add01Icon} className="mr-2 size-4" />
          New order
        </Button>
      </div>
      <label className="relative max-w-xl">
        <span className="sr-only">Search orders</span>
        <HugeiconsIcon
          icon={Search01Icon}
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Search order, customer, or item"
          value={query}
          onChange={(event) =>
            setParams({ orderQuery: event.target.value || null })
          }
        />
      </label>
    </header>
  )
}
