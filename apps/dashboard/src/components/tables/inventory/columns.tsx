import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"
import type { ReactNode } from "react"

export type InventoryBalance =
  RouterOutputs["inventory"]["balanceReport"]["rows"][number]

export type InventoryColumn = {
  header: string
  key: string
  render: (row: InventoryBalance) => ReactNode
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

export const inventoryColumns: InventoryColumn[] = [
  {
    header: "Product",
    key: "product",
    render: (row) => (
      <div>
        <p className="font-medium">{row.productName}</p>
        <p className="text-xs text-muted-foreground">{row.variantName}</p>
      </div>
    ),
  },
  {
    header: "Balance source",
    key: "source",
    render: (row) => (
      <div>
        <Badge className="rounded-full capitalize">{label(row.kind)}</Badge>
        <p className="mt-1 text-xs text-muted-foreground">
          {row.inventoryUnitName}
        </p>
      </div>
    ),
  },
  {
    header: "On hand",
    key: "onHand",
    render: (row) => <span className="tabular-nums">{row.onHandQuantity}</span>,
  },
  {
    header: "Reserved",
    key: "reserved",
    render: (row) => (
      <span className="tabular-nums">{row.reservedQuantity}</span>
    ),
  },
  {
    header: "Available",
    key: "available",
    render: (row) => (
      <span className="font-medium tabular-nums">{row.availableQuantity}</span>
    ),
  },
  {
    header: "Custody",
    key: "custody",
    render: (row) => (
      <span className="capitalize text-muted-foreground">
        {label(row.custodyType)}
      </span>
    ),
  },
]
