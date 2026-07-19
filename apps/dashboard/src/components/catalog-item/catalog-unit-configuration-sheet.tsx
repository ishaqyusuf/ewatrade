"use client"

import { UnitConfigurationManager } from "@/components/dashboard/unit-configuration-manager"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useTRPC } from "@/trpc/client"
import { useSuspenseQuery } from "@tanstack/react-query"

export function CatalogUnitConfigurationSheet() {
  const trpc = useTRPC()
  const { productUnitsId, setParams } = useCatalogItemParams()
  const { data: items } = useSuspenseQuery(
    trpc.catalog.listItems.queryOptions({}, { retry: false }),
  )
  if (!productUnitsId) return null
  const item = items.find(
    (candidate) => candidate.product?.id === productUnitsId,
  )

  return (
    <UnitConfigurationManager
      onClose={() => setParams({ productUnits: null })}
      productId={productUnitsId}
      productName={item?.name ?? "Product"}
    />
  )
}
