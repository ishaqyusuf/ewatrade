"use client"
import { InventoryOperationMenu } from "@/components/inventory/inventory-operation-menu"
import type { InventoryBalance } from "@/components/tables/inventory/columns"
import {
  formatStockQuantity,
  getInventoryStatus,
  inventoryStatusLabels,
} from "@/lib/inventory-view"
import { Sheet } from "@ewatrade/ui"
import { SheetFrame } from "./sheet-frame"
export function InventoryStoresSheet({
  record,
  onClose,
}: { record: InventoryBalance | null; onClose: () => void }) {
  return (
    <Sheet
      open={Boolean(record)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {record ? (
        <SheetFrame
          title={record.productName}
          description={
            record.variantName && record.variantName !== record.productName
              ? `${record.variantName} · stock in each store`
              : "Stock in each store"
          }
        >
          <div className="grid gap-4">
            {record.storeBalances?.map((row) => (
              <section
                key={row.balanceSourceId}
                className="border border-border p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">
                    {row.storeName}
                    {getInventoryStatus(row) === "transit" ||
                    getInventoryStatus(row) === "staff" ? (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {inventoryStatusLabels[getInventoryStatus(row)]}
                      </span>
                    ) : null}
                  </h3>
                  <InventoryOperationMenu balance={row} onAction={onClose} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  {[
                    ["In stock", row.onHandQuantity],
                    ["Held for orders", row.reservedQuantity],
                    [
                      "Free to sell",
                      row.custodyType === "TRANSIT"
                        ? "0"
                        : row.availableQuantity,
                    ],
                  ].map(([label, quantity]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="tabular-nums">
                        {formatStockQuantity(
                          quantity ?? "0",
                          row.inventoryUnitName,
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
