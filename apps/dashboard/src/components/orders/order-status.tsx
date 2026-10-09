import type { ORDER_STATUSES } from "@/hooks/use-order-filter-params"
import { cn } from "@/utils"

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const orderStatusLabels: Record<OrderStatus, string> = {
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  CONFIRMED: "Confirmed",
  DRAFT: "Draft",
  FULFILLING: "Fulfilling",
  OUT_FOR_DELIVERY: "Out for delivery",
  PENDING: "Pending",
  READY_FOR_PICKUP: "Ready for pickup",
  REFUNDED: "Refunded",
}

// Dot colours live in dashboard.css as --status-*-dot so both themes stay in one place.
const dotColor: Record<OrderStatus, string> = {
  CANCELLED: "var(--status-cancelled-dot)",
  COMPLETED: "var(--status-completed-dot)",
  CONFIRMED: "var(--status-confirmed-dot)",
  DRAFT: "var(--status-draft-dot)",
  FULFILLING: "var(--status-fulfilling-dot)",
  OUT_FOR_DELIVERY: "var(--status-delivery-dot)",
  PENDING: "var(--status-pending-dot)",
  READY_FOR_PICKUP: "var(--status-ready-dot)",
  REFUNDED: "var(--status-refunded-dot)",
}

function isOrderStatus(status: string): status is OrderStatus {
  return status in orderStatusLabels
}

export function orderStatusLabel(status: string) {
  return isOrderStatus(status) ? orderStatusLabels[status] : status
}

export function OrderStatusDot({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const known = isOrderStatus(status)
  const color = known ? dotColor[status] : "var(--muted-foreground)"
  return (
    <span
      data-slot="order-status"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-2 text-sm whitespace-nowrap",
        className,
      )}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={
          status === "DRAFT"
            ? { boxShadow: `inset 0 0 0 1.5px ${color}` }
            : { background: color }
        }
      />
      <span
        className={cn(
          status === "CANCELLED" &&
            "text-muted-foreground line-through decoration-1",
        )}
      >
        {orderStatusLabel(status)}
      </span>
    </span>
  )
}
