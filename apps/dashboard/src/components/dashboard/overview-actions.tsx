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
import { Add01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

/** The Overview's one "New" menu; the floating + offers the same actions. */
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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label="New: choose what to add"
          />
        }
      >
        <HugeiconsIcon icon={Add01Icon} className="size-4" />
        New
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className="size-3.5 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent appearance="dashboard" align="end">
        {orders ? (
          <DropdownMenuItem
            onClick={() => void setOrderParams({ orderSheet: "create" })}
          >
            New order
          </DropdownMenuItem>
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
              Add product
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
