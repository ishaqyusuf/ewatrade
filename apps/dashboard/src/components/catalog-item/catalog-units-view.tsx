"use client"

import { UnitConfigurationManager } from "@/components/dashboard/unit-configuration-manager"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import type { ComponentProps } from "react"

import { useCatalogThemeClass } from "./catalog-appearance"

/** Units as a view inside the item's details sheet, returning to the item. */
export function CatalogUnitsView({
  productId,
  itemName,
  storeName,
  back,
  finalFocus,
}: {
  productId: string
  itemName: string
  storeName: string
  back(): void
  finalFocus?: ComponentProps<typeof SheetFrame>["finalFocus"]
}) {
  const themeClass = useCatalogThemeClass()
  return (
    <SheetFrame
      popupClassName={themeClass}
      title="Units"
      description={`${itemName} · ${storeName}`}
      back={{ label: `Back to ${itemName}`, onClick: back }}
      finalFocus={finalFocus}
    >
      <UnitConfigurationManager
        key={productId}
        productId={productId}
        popupClassName={themeClass}
      />
    </SheetFrame>
  )
}
