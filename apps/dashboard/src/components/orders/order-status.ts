import { ORDER_STATUSES } from "@/hooks/use-order-filter-params"
import type { PillTone } from "./overview/order-overview-model"

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

/** Not started is muted, in progress blue, done green, closed red. */
const orderStatusTones: Record<OrderStatus, PillTone> = {
  CANCELLED: "red",
  COMPLETED: "green",
  CONFIRMED: "blue",
  DRAFT: "muted",
  FULFILLING: "blue",
  OUT_FOR_DELIVERY: "blue",
  PENDING: "muted",
  READY_FOR_PICKUP: "blue",
  REFUNDED: "red",
}

function asOrderStatus(status: string) {
  return ORDER_STATUSES.find((value) => value === status)
}

export function orderStatusPill(status: string): {
  label: string
  tone: PillTone
} {
  const known = asOrderStatus(status)
  return known
    ? { label: orderStatusLabels[known], tone: orderStatusTones[known] }
    : { label: status.toLowerCase().replaceAll("_", " "), tone: "muted" }
}
