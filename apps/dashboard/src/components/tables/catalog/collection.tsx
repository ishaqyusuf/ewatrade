"use client"

import {
  type CollectionView,
  DirectoryCollection,
  DirectoryRecord,
} from "@/components/tables/core"
import { Badge } from "@ewatrade/ui"
import { productUsageLabels } from "@ewatrade/utils/product-usage"
import type { Row } from "@tanstack/react-table"
import {
  CatalogItemThumbnail,
  CatalogKindBadge,
  type CatalogRow,
  getCatalogPrice,
  getCatalogStock,
  itemDetail,
} from "./columns"
import { CatalogItemActions } from "./item-actions"

export function CatalogCollection({
  rows,
  view,
  storeId,
  openUnits,
  openDetail,
}: {
  rows: Row<CatalogRow>[]
  view: CollectionView
  storeId: string
  openUnits: (productId: string) => void
  openDetail: (itemId: string) => void
}) {
  return (
    <DirectoryCollection view={view} label="Catalog item">
      {rows.map((row) => {
        const item = row.original
        return (
          <DirectoryRecord
            key={row.id}
            row={row}
            view={view}
            selectLabel={`Select ${item.name}`}
            media={<CatalogItemThumbnail item={item} storeId={storeId} />}
            title={item.name}
            onOpen={() => openDetail(item.id)}
            description={`${itemDetail(item)}${
              item.product
                ? ` · ${productUsageLabels[item.product.usage ?? "FOR_SALE"]}`
                : ""
            }`}
            badges={
              <>
                <CatalogKindBadge item={item} />
                <Badge variant="outline" className="capitalize">
                  {item.status}
                </Badge>
              </>
            }
            details={[
              { label: "Price", value: getCatalogPrice(item) },
              { label: "Stock", value: getCatalogStock(item) },
            ]}
            actions={
              <CatalogItemActions
                item={item}
                storeId={storeId}
                openUnits={openUnits}
              />
            }
          />
        )
      })}
    </DirectoryCollection>
  )
}
