"use client"

import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { useOrderParams } from "@/hooks/use-order-params"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import {
  Add01Icon,
  ArrowDown01Icon,
  ShoppingCart01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

/**
 * Overview toolbar (640px and up): "New order" is the one primary action; the
 * Add menu holds the rest. Phones get the same actions from the + button.
 */
export function OverviewActions({
  orders,
  stock,
  catalog,
}: { orders: boolean; stock: boolean; catalog: boolean }) {
  const { setParams: setOrderParams } = useOrderParams()
  const { setParams: setInventoryParams } = useInventoryParams()
  const { setParams: setCatalogParams } = useCatalogItemParams()
  if (!orders && !stock && !catalog) return null
  return (
    <div className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
      {stock || catalog ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                aria-label="Add: choose what to add"
              />
            }
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Add
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="size-4 text-muted-foreground"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent appearance="dashboard" align="end">
            {catalog ? (
              <>
                <DropdownMenuItem
                  onClick={() =>
                    void setCatalogParams({
                      catalogItem: "create",
                      catalogCreateKind: "product",
                    })
                  }
                >
                  Add item
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void setCatalogParams({
                      catalogItem: "create",
                      catalogCreateKind: "service",
                    })
                  }
                >
                  Add service
                </DropdownMenuItem>
              </>
            ) : null}
            {stock ? (
              <DropdownMenuItem
                onClick={() =>
                  void setInventoryParams({ inventoryOperation: "adjustment" })
                }
              >
                Update stock
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {orders ? (
        <Button
          type="button"
          onClick={() => void setOrderParams({ orderSheet: "create" })}
        >
          <HugeiconsIcon icon={ShoppingCart01Icon} className="size-4" />
          New order
        </Button>
      ) : null}
    </div>
  )
}
