import { cn } from "@/utils"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge, Button } from "@ewatrade/ui"
import { Package01Icon, ToolsIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"

import { catalogItemDetail } from "./catalog-display"

export type CatalogRow = RouterOutputs["catalog"]["listItems"][number]

export type CatalogColumn = {
  header: string
  key: string
  render: (item: CatalogRow) => ReactNode
}

function primaryOffering(item: CatalogRow) {
  const variant =
    item.variants.find((candidate) => candidate.isDefault) ?? item.variants[0]
  return variant?.offerings[0] ?? null
}

function itemDetail(item: CatalogRow) {
  if (item.variants.length !== 1) {
    return `${item.variants.length} variants`
  }

  const variant = item.variants[0]
  const offering = primaryOffering(item)
  return catalogItemDetail({
    itemName: item.name,
    offeringCount: variant?.offerings.length ?? 0,
    offeringName: offering?.name,
    variantName: variant?.name,
  })
}

function formatPrice(value: number | null, currencyCode: string) {
  if (value === null) return "Quote"
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(value / 100)
}

export function createCatalogColumns(
  openUnits: (productId: string) => void,
): CatalogColumn[] {
  return [
    {
      header: "Item",
      key: "item",
      render: (item) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <HugeiconsIcon
              icon={item.kind === "service" ? ToolsIcon : Package01Icon}
              className="size-4 text-muted-foreground"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{item.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {itemDetail(item)}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: "Type",
      key: "type",
      render: (item) => (
        <Badge
          className={cn(
            "rounded-full",
            item.kind === "service"
              ? "bg-blue-50 text-blue-700"
              : "bg-violet-50 text-violet-700",
          )}
        >
          {item.kind === "service" ? "Service" : "Product"}
        </Badge>
      ),
    },
    {
      header: "Price",
      key: "price",
      render: (item) => {
        const offering = primaryOffering(item)
        return offering
          ? formatPrice(offering.fixedPriceMinor, offering.currencyCode)
          : "—"
      },
    },
    {
      header: "Stock",
      key: "stock",
      render: (item) => {
        const balance = item.product?.stockBalances[0]
        return balance
          ? `${balance.onHandQuantity} ${balance.inventoryUnitName}`
          : "—"
      },
    },
    {
      header: "Status",
      key: "status",
      render: (item) => (
        <span className="capitalize text-muted-foreground">{item.status}</span>
      ),
    },
    {
      header: "",
      key: "actions",
      render: (item) => {
        const product = item.product

        return product ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openUnits(product.id)}
          >
            Configure units
          </Button>
        ) : null
      },
    },
  ]
}
