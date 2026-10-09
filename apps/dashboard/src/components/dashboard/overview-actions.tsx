"use client"

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
  ArrowDataTransferVerticalIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function OverviewActions({
  orders,
  stock,
}: { orders: boolean; stock: boolean }) {
  const { setParams: setOrderParams } = useOrderParams()
  const { setParams: setInventoryParams } = useInventoryParams()
  if (!orders && !stock) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Quick actions"
          />
        }
      >
        <HugeiconsIcon icon={Add01Icon} className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent appearance="dashboard" align="end">
        {orders ? (
          <DropdownMenuItem
            onClick={() => void setOrderParams({ orderSheet: "create" })}
          >
            Create order
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The Revenue hero's own buttons: the same two actions as the "+" menu, laid
 * out as a primary and a secondary button.
 */
export function OverviewHeroActions({
  orders,
  stock,
  firstOrder,
  orderDisabled,
}: {
  orders: boolean
  stock: boolean
  /** No orders yet: the create button reads "Create first order". */
  firstOrder: boolean
  /** Mirrors the setup checklist: no active sellable item to order yet. */
  orderDisabled: boolean
}) {
  const { setParams: setOrderParams } = useOrderParams()
  const { setParams: setInventoryParams } = useInventoryParams()
  if (!orders && !stock) return null
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {orders ? (
        <Button
          type="button"
          disabled={orderDisabled}
          onClick={() => void setOrderParams({ orderSheet: "create" })}
        >
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          {firstOrder ? "Create first order" : "New order"}
        </Button>
      ) : null}
      {stock ? (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void setInventoryParams({ inventoryOperation: "adjustment" })
          }
        >
          <HugeiconsIcon
            icon={ArrowDataTransferVerticalIcon}
            data-icon="inline-start"
          />
          Update stock
        </Button>
      ) : null}
    </div>
  )
}
