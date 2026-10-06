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
import { Add01Icon } from "@hugeicons/core-free-icons"
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
