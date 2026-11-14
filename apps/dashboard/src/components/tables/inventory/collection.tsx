"use client"

import { formatStockQuantity } from "@/lib/inventory-view"
import { Button } from "@ewatrade/ui"
import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Row } from "@tanstack/react-table"
import {
  type InventoryBalance,
  InventoryRowActions,
  InventoryStatusBadge,
  getInventoryLineDetail,
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
      className="block h-auto max-w-full truncate p-0 text-left text-base font-medium text-foreground"
      onClick={() => onOpen(balance.catalogItemId)}
    >
      {balance.productName}
    </Button>
  )
}

/** "5 crates held" when some stock is set aside for orders. */
function heldText(balance: InventoryBalance) {
  return compareExactDecimals(balance.reservedQuantity, "0") > 0
    ? `${formatStockQuantity(balance.reservedQuantity, balance.inventoryUnitName)} held`
    : null
}

/**
 * One row per stock line. Every width shows what can be sold and its status;
 * wider screens add what is on the shelf.
 */
function InventoryList({ rows, onOpen, onStores }: CollectionProps) {
  return (
    <ul
      aria-label="Stock list"
      className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
    >
      {rows.map((row) => {
        const balance = row.original
        const unit = balance.inventoryUnitName
        const held = heldText(balance)
        return (
          <li
            key={row.id}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 py-3 pr-1 pl-4 md:grid-cols-[minmax(0,1fr)_9rem_9rem_8.5rem_auto]"
          >
            <div className="grid min-w-0 gap-0.5">
              <ProductName balance={balance} onOpen={onOpen} />
              <span className="truncate text-sm text-muted-foreground">
                {[getInventoryLineDetail(balance), held]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <span className="text-right text-sm tabular-nums text-muted-foreground max-md:hidden">
              {formatStockQuantity(balance.onHandQuantity, unit)} in stock
            </span>
            <div className="grid justify-items-end gap-1 md:contents">
              <span className="text-right font-semibold tabular-nums">
                <span className="md:hidden">
                  {formatStockQuantity(balance.availableQuantity, unit)}
                </span>
                <span className="max-md:hidden">
                  {formatStockQuantity(balance.availableQuantity, unit)} free
                </span>
              </span>
              <span className="md:justify-self-end">
                <InventoryStatusBadge row={balance} />
              </span>
            </div>
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
            <article className="flex h-full flex-col gap-3 rounded-[var(--ui-radius-surface)] border border-border bg-card p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="grid min-w-0">
                  <ProductName balance={balance} onOpen={onOpen} />
                  <span className="truncate text-sm text-muted-foreground">
                    {getInventoryLineDetail(balance)}
                  </span>
                </div>
                <InventoryRowActions row={balance} onStores={onStores} />
              </div>
              <InventoryStatusBadge row={balance} />
              <dl className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
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
