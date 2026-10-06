"use client"
import { useOrderParams } from "@/hooks/use-order-params"
import { useReceiptParams } from "@/hooks/use-receipt-params"
import { isReceiptOrderEligible } from "@ewatrade/order-receipts"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import type { OrderRow } from "./columns"

export function OrderActionsMenu({ order }: { order: OrderRow }) {
  const { setParams } = useReceiptParams()
  const { setParams: setOrder } = useOrderParams()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${order.orderNumber}`}
          >
            ···
          </Button>
        }
      />
      <DropdownMenuContent appearance="dashboard" align="end">
        <DropdownMenuItem
          onClick={() =>
            void setOrder({ orderSheet: "details", orderId: order.id })
          }
        >
          Details
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!isReceiptOrderEligible(order.status)}
          onClick={() => void setParams({ receiptIds: [order.id] })}
        >
          Receipt
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
