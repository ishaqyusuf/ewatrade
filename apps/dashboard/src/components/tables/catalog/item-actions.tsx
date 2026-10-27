"use client"

import { useCatalogThemeClass } from "@/components/catalog-item/catalog-appearance"
import { canShareCatalogProduct } from "@/components/catalog-item/catalog-product-share"
import { CatalogProductShareDialog } from "@/components/catalog-item/catalog-product-share-dialog"
import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
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
  PencilEdit02Icon,
  RulerIcon,
  Share01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"
import type { CatalogRow } from "./columns"

/** Images and Units change the item, so they open as views inside its details sheet. */
export function CatalogItemActions({
  item,
  storeId,
}: { item: CatalogRow; storeId: string }) {
  const { open: openDetail } = useCatalogDetailParams()
  const themeClass = useCatalogThemeClass()
  const { setParams } = useInventoryParams()
  const { editCatalogItem } = useCatalogItemParams()
  const productId = item.product?.id
  // Stock consumed inside the business is recorded for Internal use or Both.
  const canRecordUse =
    item.product?.usage === "INTERNAL_USE" || item.product?.usage === "BOTH"
  const shareable = canShareCatalogProduct(item)
  const [sharing, setSharing] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
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
                void editCatalogItem(item.id)
              }}
            >
              <HugeiconsIcon icon={PencilEdit02Icon} aria-hidden="true" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation()
                void openDetail(item.id, "images")
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
                  {INVENTORY_ACTIONS.filter(
                    (action) => action.mode !== "internal_use" || canRecordUse,
                  ).map((action) => (
                    <DropdownMenuItem
                      key={action.label}
                      onClick={(event) => {
                        event.stopPropagation()
                        void setParams({
                          inventoryOperation: action.mode,
                          inventoryProduct: productId,
                          inventoryPreset:
                            "preset" in action ? action.preset : null,
                        })
                      }}
                    >
                      <HugeiconsIcon
                        icon={
                          action.mode === "internal_use"
                            ? Upload01Icon
                            : Add01Icon
                        }
                        aria-hidden="true"
                      />
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
                  void openDetail(item.id, "units")
                }}
              >
                <HugeiconsIcon icon={RulerIcon} aria-hidden="true" />
                Units
              </DropdownMenuItem>
            ) : null}
            {shareable ? (
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation()
                  setSharing(true)
                }}
              >
                <HugeiconsIcon icon={Share01Icon} aria-hidden="true" />
                Share
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {shareable ? (
        <CatalogProductShareDialog
          itemId={item.id}
          itemName={item.name}
          storeId={storeId}
          open={sharing}
          onOpenChange={setSharing}
        />
      ) : null}
    </>
  )
}
