"use client"

import { RowSelectCheckbox } from "@/components/tables/core"
import { formatStockQuantity } from "@/lib/inventory-view"
import { Button } from "@ewatrade/ui"
import type { Row } from "@tanstack/react-table"
import {
  type InventoryBalance,
  InventoryRowActions,
  InventoryStatusBadge,
  getInventoryLineDetail,
  getInventoryRecordName,
} from "./columns"

type CollectionProps = {
  rows: Row<InventoryBalance>[]
  onOpen: (catalogItemId: string) => void
  onStores: (row: InventoryBalance) => void
}

function ProductName({
  balance,
  onOpen,
}: {
  balance: InventoryBalance
  onOpen: (catalogItemId: string) => void
}) {
  return (
    <Button
      type="button"
      variant="link"
      className="block h-auto max-w-full truncate p-0 text-left font-medium text-foreground"
      onClick={() => onOpen(balance.catalogItemId)}
    >
      {balance.productName}
    </Button>
  )
}

/** One bordered panel with a row per stock line; extra figures hide on phones. */
function InventoryList({ rows, onOpen, onStores }: CollectionProps) {
  return (
    <ul aria-label="Stock list" className="divide-y rounded-lg border">
      {rows.map((row) => {
        const balance = row.original
        const unit = balance.inventoryUnitName
        return (
          <li
            key={row.id}
            data-state={row.getIsSelected() ? "selected" : undefined}
            className="grid grid-cols-[1rem_minmax(0,1fr)_auto_2rem] items-center gap-3 px-3 py-2.5 data-[state=selected]:bg-muted md:grid-cols-[1rem_minmax(0,1fr)_auto_9rem_9rem_2rem]"
          >
            <RowSelectCheckbox
              row={row}
              label={`Select ${getInventoryRecordName(balance)}`}
            />
            <div className="grid min-w-0">
              <ProductName balance={balance} onOpen={onOpen} />
              <span className="truncate text-sm text-muted-foreground">
                {getInventoryLineDetail(balance)}
              </span>
            </div>
            <InventoryStatusBadge row={balance} />
            <span className="text-right text-sm tabular-nums text-muted-foreground max-md:hidden">
              {formatStockQuantity(balance.onHandQuantity, unit)} in stock
            </span>
            <span className="text-right text-sm font-semibold tabular-nums max-md:hidden">
              {formatStockQuantity(balance.availableQuantity, unit)} free
            </span>
            <InventoryRowActions row={balance} onStores={onStores} />
          </li>
        )
      })}
    </ul>
  )
}

/** Grid columns are fixed by screen width: 1, then 2 at md, 3 at lg, 4 at xl. */
function InventoryGrid({ rows, onOpen, onStores }: CollectionProps) {
  return (
    <ul
      aria-label="Stock grid"
      className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {rows.map((row) => {
        const balance = row.original
        const unit = balance.inventoryUnitName
        return (
          <li key={row.id} className="min-w-0">
            <article
              data-state={row.getIsSelected() ? "selected" : undefined}
              className="flex h-full flex-col gap-3 rounded-xl border bg-card p-3 data-[state=selected]:border-transparent data-[state=selected]:ring-2 data-[state=selected]:ring-primary"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="grid min-w-0">
                  <ProductName balance={balance} onOpen={onOpen} />
                  <span className="truncate text-sm text-muted-foreground">
                    {getInventoryLineDetail(balance)}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <RowSelectCheckbox
                    row={row}
                    label={`Select ${getInventoryRecordName(balance)}`}
                  />
                  <InventoryRowActions row={balance} onStores={onStores} />
                </div>
              </div>
              <InventoryStatusBadge row={balance} />
              <dl className="mt-auto grid grid-cols-2 gap-2 border-t pt-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-muted-foreground">In stock</dt>
                  <dd className="truncate tabular-nums">
                    {formatStockQuantity(balance.onHandQuantity, unit)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Free to sell</dt>
                  <dd className="truncate font-semibold tabular-nums">
                    {formatStockQuantity(balance.availableQuantity, unit)}
                  </dd>
                </div>
              </dl>
            </article>
          </li>
        )
      })}
    </ul>
  )
}

export function InventoryCollection({
  view,
  ...props
}: CollectionProps & { view: "list" | "cards" }) {
  return view === "cards" ? (
    <InventoryGrid {...props} />
  ) : (
    <InventoryList {...props} />
  )
}
