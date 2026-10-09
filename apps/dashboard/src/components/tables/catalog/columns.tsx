"use client"

import { CatalogIllustrationPreview } from "@/components/catalog-item/catalog-illustration-preview"
import { CatalogPhotoPreview } from "@/components/catalog-item/catalog-photo-preview"
import { selectColumn } from "@/components/tables/core"
import { cn } from "@/utils"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge, Button } from "@ewatrade/ui"
import { productUsageLabels } from "@ewatrade/utils/product-usage"
import { Package01Icon, ToolsIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ColumnDef } from "@tanstack/react-table"

import { catalogItemDetail } from "./catalog-display"
import { CatalogItemActions } from "./item-actions"

export type CatalogRow =
  RouterOutputs["catalog"]["listItemsPage"]["items"][number]

export function getCatalogPrice(item: CatalogRow) {
  const offering = primaryOffering(item)
  return offering
    ? formatPrice(
        offering.fixedPriceMinor,
        offering.currencyCode,
        offering.pricingPolicy,
      )
    : "—"
}

export function getCatalogStock(item: CatalogRow) {
  const balance = item.product?.stockBalances[0]
  return balance
    ? `${balance.onHandQuantity} ${balance.inventoryUnitName}`
    : "—"
}

export function primaryOffering(item: CatalogRow) {
  const variant =
    item.variants.find((candidate) => candidate.isDefault) ?? item.variants[0]
  return variant?.offerings[0] ?? null
}

export function itemDetail(item: CatalogRow) {
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

export function formatPrice(
  value: number | null,
  currencyCode: string,
  pricingPolicy: string,
) {
  if (pricingPolicy === "order_total") return "Enter price during order"
  if (value === null)
    return pricingPolicy === "quote_required" ? "Quote" : "Price not set"
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(value / 100)
}

export function CatalogItemThumbnail({
  item,
  storeId,
}: {
  item: CatalogRow
  storeId: string
}) {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
      {item.photos.find((photo) => photo.storeId === storeId) ? (
        <CatalogPhotoPreview
          compact
          assetId={
            item.photos.find((photo) => photo.storeId === storeId)?.assetId ??
            ""
          }
          storeId={storeId}
          label={item.name}
        />
      ) : item.illustrations.find((entry) => entry.storeId === storeId) ? (
        <CatalogIllustrationPreview
          compact
          illustrationId={
            item.illustrations.find((entry) => entry.storeId === storeId)
              ?.illustrationId ?? ""
          }
        />
      ) : (
        <HugeiconsIcon
          icon={item.kind === "service" ? ToolsIcon : Package01Icon}
          className="size-4 text-muted-foreground"
        />
      )}
    </div>
  )
}

export function CatalogKindBadge({ item }: { item: CatalogRow }) {
  return (
    <Badge
      className={cn(
        "rounded-full",
        item.kind === "service"
          ? "bg-accent text-accent-foreground"
          : "bg-secondary text-secondary-foreground",
      )}
    >
      {item.kind === "service" ? "Service" : "Product"}
    </Badge>
  )
}

export function createCatalogColumns(
  openUnits: (productId: string) => void,
  storeId = "",
  openDetail: (itemId: string) => void = () => {},
): ColumnDef<CatalogRow>[] {
  return [
    selectColumn((item) => item.name),
    {
      id: "item",
      accessorKey: "name",
      header: "Item",
      size: 320,
      minSize: 240,
      maxSize: 500,
      enableHiding: false,
      meta: {
        headerLabel: "Item",
        sticky: true,
        reorderable: false,
        sortField: "name",
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-focus-visible:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
        skeleton: { type: "avatar-text", width: "w-32" },
      },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <CatalogItemThumbnail item={row.original} storeId={storeId} />
          <div className="min-w-0">
            <Button
              type="button"
              variant="link"
              size="sm"
              data-catalog-open={row.original.id}
              className="block h-auto max-w-full truncate p-0 text-left"
              onClick={() => openDetail(row.original.id)}
            >
              {row.original.name}
            </Button>
            <p className="truncate text-xs text-muted-foreground">
              {itemDetail(row.original)}
              {row.original.product
                ? ` · ${productUsageLabels[row.original.product.usage ?? "FOR_SALE"]}`
                : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "kind",
      accessorKey: "kind",
      header: "Type",
      size: 130,
      minSize: 110,
      maxSize: 180,
      meta: {
        headerLabel: "Type",
        sortField: "kind",
        skeleton: { type: "badge", width: "w-20" },
      },
      cell: ({ row }) => <CatalogKindBadge item={row.original} />,
    },
    {
      id: "price",
      header: "Price",
      size: 180,
      minSize: 140,
      maxSize: 240,
      meta: {
        headerLabel: "Price",
        skeleton: { type: "text", width: "w-24" },
      },
      cell: ({ row }) => getCatalogPrice(row.original),
    },
    {
      id: "stock",
      header: "Stock",
      size: 180,
      minSize: 140,
      maxSize: 240,
      meta: {
        headerLabel: "Stock",
        skeleton: { type: "text", width: "w-20" },
      },
      cell: ({ row }) => getCatalogStock(row.original),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      size: 140,
      minSize: 120,
      maxSize: 180,
      meta: {
        headerLabel: "Status",
        sortField: "status",
        skeleton: { type: "badge", width: "w-20" },
      },
      cell: ({ row }) => (
        <span className="capitalize text-muted-foreground">
          {row.original.status}
        </span>
      ),
    },
    {
      id: "actions",
      size: 80,
      minSize: 80,
      maxSize: 80,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerLabel: "Actions",
        sticky: true,
        reorderable: false,
        className: "z-20 border-l bg-background md:sticky",
        skeleton: { type: "icon" },
      },
      cell: ({ row }) => (
        <CatalogItemActions
          item={row.original}
          storeId={storeId}
          openUnits={openUnits}
        />
      ),
    },
  ]
}
