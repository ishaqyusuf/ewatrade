"use client"

import {
  type CollectionView,
  DirectoryCollection,
  DirectoryRecord,
} from "@/components/tables/core"
import { formatInventoryQuantity } from "@/lib/inventory-view"
import { Badge, Button } from "@ewatrade/ui"
import type { Row } from "@tanstack/react-table"
import {
  type InventoryBalance,
  InventoryRowActions,
  getInventoryRecordName,
  getInventoryStoreCount,
  inventoryLabel,
} from "./columns"

export function InventoryCollection({
  rows,
  view,
  onOpen,
  onStores,
}: {
  rows: Row<InventoryBalance>[]
  view: CollectionView
  onOpen: (catalogItemId: string) => void
  onStores: (row: InventoryBalance) => void
}) {
  return (
    <DirectoryCollection view={view} label="Inventory balance">
      {rows.map((row) => {
        const balance = row.original
        const unit = balance.inventoryUnitName
        return (
          <DirectoryRecord
            key={row.id}
            row={row}
            view={view}
            selectLabel={`Select ${getInventoryRecordName(balance)}`}
            title={balance.productName}
            onOpen={() => onOpen(balance.catalogItemId)}
            description={
              balance.storeBalances ? (
                <Button
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => onStores(balance)}
                >
                  {balance.variantName} · {getInventoryStoreCount(balance)}{" "}
                  store(s)
                </Button>
              ) : (
                `${balance.variantName} · ${balance.storeName}`
              )
            }
            badges={
              <>
                <Badge className="rounded-full capitalize">
                  {inventoryLabel(balance.kind)}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {inventoryLabel(balance.custodyType)}
                </Badge>
              </>
            }
            details={[
              {
                label: "On hand",
                value: (
                  <span className="tabular-nums">
                    {formatInventoryQuantity(balance.onHandQuantity)} {unit}
                  </span>
                ),
              },
              {
                label: "Reserved",
                value: (
                  <span className="tabular-nums">
                    {formatInventoryQuantity(balance.reservedQuantity)} {unit}
                  </span>
                ),
              },
              {
                label: "Available",
                value: (
                  <span className="font-semibold tabular-nums">
                    {formatInventoryQuantity(balance.availableQuantity)} {unit}
                  </span>
                ),
              },
            ]}
            actions={<InventoryRowActions row={balance} onStores={onStores} />}
          />
        )
      })}
    </DirectoryCollection>
  )
}
