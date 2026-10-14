"use client"
import { useOrderMessageAction } from "@/components/customer-messages/use-order-message-action"
import { whatsAppActionCopy } from "@/components/customer-messages/whatsapp-notify-button"
import { useOrderParams } from "@/hooks/use-order-params"
import { useReceiptParams } from "@/hooks/use-receipt-params"
import { isReceiptOrderEligible } from "@ewatrade/order-receipts"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@ewatrade/ui"
import { WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { useState } from "react"
import type { OrderRow } from "./columns"

export function OrderActionsMenu({ order }: { order: OrderRow }) {
  const { setParams } = useReceiptParams()
  const { setParams: setOrder } = useOrderParams()
  // Readiness is read only while this row's menu is open: no per-row reads.
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
          render={
            <Link href={`/sales/orders/${encodeURIComponent(order.id)}`} />
          }
        >
          Open page
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!isReceiptOrderEligible(order.status)}
          onClick={() => void setParams({ receiptIds: [order.id] })}
        >
          Receipt
        </DropdownMenuItem>
        {order.customerPhone ? (
          <WhatsAppMenuItem orderId={order.id} enabled={open} />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The same readiness as the Order's button: green ready, grey otherwise. */
function WhatsAppMenuItem({
  orderId,
  enabled,
}: {
  orderId: string
  enabled: boolean
}) {
  const action = useOrderMessageAction({ orderId, enabled })
  if (action.state.kind === "hidden") return null
  const ready = action.state.kind === "ready"
  return (
    <DropdownMenuItem
      disabled={action.state.kind === "loading"}
      onClick={() =>
        action.state.kind === "error" ? action.retry() : action.open()
      }
    >
      <HugeiconsIcon
        icon={WhatsappIcon}
        className={cn(
          "size-4",
          ready
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground",
        )}
      />
      <span className="grid">
        <span>WhatsApp message</span>
        <span className="text-xs text-muted-foreground">
          {whatsAppActionCopy(action.state).hint}
        </span>
      </span>
    </DropdownMenuItem>
  )
}
