import {
  type CommercialOrder,
  commerceLineOption,
  commerceLineTitle,
  formatCommerceQuantity,
} from "@/components/mobile/commerce/commerce-model"
import { canFulfillCommercialOrderLine } from "@/components/mobile/commerce/commercial-order-overview-model"

export const ORDER_PAYMENT_METHODS = [
  ["cash", "Cash"],
  ["bank_transfer", "Transfer"],
  ["pos", "POS"],
  ["other", "Other"],
] as const

export type OrderFulfilmentTarget =
  | { kind: "all" }
  | { kind: "line"; orderLineId: string }

export type OrderFulfilmentConfirmation = {
  actionLabel: string
  detail: string
  detailTitle: string
  kind: OrderFulfilmentTarget["kind"]
  orderLineId: string | null
  summaryLabel: string
  summaryValue: string
  title: string
  warning: string
}

export function getOrderFulfilmentConfirmation(
  order: CommercialOrder,
  target: OrderFulfilmentTarget,
): OrderFulfilmentConfirmation | null {
  if (target.kind === "line") {
    const line = order.lines.find(
      (candidate) => candidate.id === target.orderLineId,
    )
    if (!line || !canFulfillCommercialOrderLine(line)) return null

    const itemName = line.snapshot?.catalogItemName ?? "Product"
    const option = commerceLineOption(line)
    const unit = line.snapshot?.inventoryUnitName ?? "item"

    return {
      actionLabel: "Confirm fulfilment",
      detail: "Reservation active",
      detailTitle: commerceLineTitle(line),
      kind: "line",
      orderLineId: line.id,
      summaryLabel: `${itemName} · ${option}`.toUpperCase(),
      summaryValue: `${formatCommerceQuantity(line.quantity)} × ${unit}`,
      title: "Fulfil product line",
      warning:
        "This records the stock movement and updates the Order. Confirm only when the items are ready.",
    }
  }

  const readyLines = order.lines.filter(canFulfillCommercialOrderLine)
  if (readyLines.length === 0) return null
  const lineLabel = readyLines.length === 1 ? "line" : "lines"

  return {
    actionLabel: "Fulfil all ready",
    detail: "Commits every active Product reservation in this Order.",
    detailTitle: `${readyLines.length} Product ${lineLabel}`,
    kind: "all",
    orderLineId: null,
    summaryLabel: "READY TO FULFIL",
    summaryValue: `${readyLines.length} ${lineLabel}`,
    title: "Fulfil all ready lines",
    warning:
      "This records stock movement for every ready line and updates the Order. Confirm only when all items are ready.",
  }
}
