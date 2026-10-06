"use client"

import { useCatalogThemeClass } from "@/components/catalog-item/catalog-appearance"
import { CatalogSavedPhotos } from "@/components/catalog-item/catalog-saved-photos"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { INVENTORY_ACTIONS } from "@/lib/inventory-operations"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import {
  Add01Icon,
  Image01Icon,
  MoreVerticalIcon,
  Package01Icon,
  RulerIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"
import type { CatalogRow } from "./columns"

export function CatalogItemActions({
  item,
  storeId,
  openUnits,
}: {
  item: CatalogRow
  storeId: string
  openUnits(productId: string): void
}) {
  const [imagesOpen, setImagesOpen] = useState(false)
  const themeClass = useCatalogThemeClass()
  const { setParams } = useInventoryParams()
  const productId = item.product?.id

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              appearance="form"
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${item.name}`}
              data-row-interactive="true"
            />
          }
        >
          <HugeiconsIcon icon={MoreVerticalIcon} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          appearance="dashboard"
          align="end"
          className={themeClass}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation()
                setImagesOpen(true)
              }}
            >
              <HugeiconsIcon icon={Image01Icon} aria-hidden="true" />
              Images
            </DropdownMenuItem>
            {productId ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  data-row-interactive="true"
                  onClick={(event) => event.stopPropagation()}
                >
                  <HugeiconsIcon icon={Package01Icon} aria-hidden="true" />
                  Inventory
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  appearance="dashboard"
                  className={themeClass}
                >
                  {INVENTORY_ACTIONS.map((action) => (
                    <DropdownMenuItem
                      key={action.mode}
                      onClick={(event) => {
                        event.stopPropagation()
                        void setParams({
                          inventoryOperation: action.mode,
                          inventoryProduct: productId,
                        })
                      }}
                    >
                      <HugeiconsIcon icon={Add01Icon} aria-hidden="true" />
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            {productId ? (
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation()
                  openUnits(productId)
                }}
              >
                <HugeiconsIcon icon={RulerIcon} aria-hidden="true" />
                Configure units
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <CatalogSavedPhotos
        item={item}
        storeId={storeId}
        open={imagesOpen}
        onOpenChange={setImagesOpen}
      />
    </>
  )
}
