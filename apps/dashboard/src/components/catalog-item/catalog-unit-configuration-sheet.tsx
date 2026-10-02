"use client"

import { UnitConfigurationManager } from "@/components/dashboard/unit-configuration-manager"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useTRPC } from "@/trpc/client"
import { Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

import { useCatalogThemeClass } from "./catalog-appearance"

export function CatalogUnitConfigurationSheet() {
  const themeClass = useCatalogThemeClass()
  const trpc = useTRPC()
  const { productUnitsId, setParams } = useCatalogItemParams()
  const { closeError, requestClose } = useSheetDismissal(() =>
    setParams({ productUnits: null }),
  )
  const { data: items } = useQuery(
    trpc.catalog.listItems.queryOptions(
      {},
      { enabled: Boolean(productUnitsId), retry: false },
    ),
  )
  const item = items?.find(
    (candidate) => candidate.product?.id === productUnitsId,
  )

  return (
    <Sheet
      open={Boolean(productUnitsId)}
      onOpenChange={(open) => {
        if (!open) void requestClose()
      }}
    >
      {productUnitsId ? (
        <SheetFrame
          closeError={closeError}
          popupClassName={themeClass}
          title="Unit configuration"
          description={item?.name ?? "Product"}
        >
          <UnitConfigurationManager
            key={productUnitsId}
            productId={productUnitsId}
            popupClassName={themeClass}
          />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
