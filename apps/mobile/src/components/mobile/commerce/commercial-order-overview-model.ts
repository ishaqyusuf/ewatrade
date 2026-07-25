import { formatMinorMoney } from "@ewatrade/utils"
import {
  type CommercialOrder,
  type CommercialOrderLine,
  commerceLineTitle,
  commerceStatusLabel,
  formatCommerceDateTime,
  formatCommerceQuantity,
} from "./commerce-model"

export type CommercialOrderActivity = {
  detail: string
  key: string
  label: string
  time: string
}

export function canFulfillCommercialOrderLine(line: CommercialOrderLine) {
  return (
    line.kind === "product" &&
    line.productFulfillments.length === 0 &&
    line.reservation?.status === "ACTIVE"
  )
}

export function getCommercialOrderOverviewSummary(order: CommercialOrder) {
  const itemCount = order.lines.reduce(
    (total, line) => total + Number(line.quantity),
    0,
  )
  const productLines = order.lines.filter((line) => line.kind === "product")
  const serviceLines = order.lines.filter((line) => line.kind === "service")
  const fulfilledProductLines = productLines.filter(
    (line) => line.productFulfillments.length > 0,
  )

  return {
    fulfilledProductLineCount: fulfilledProductLines.length,
    fulfillableProductLineCount: productLines.filter(
      canFulfillCommercialOrderLine,
    ).length,
    itemCount,
    lineCount: order.lines.length,
    productLineCount: productLines.length,
    serviceLineCount: serviceLines.length,
  }
}

export function buildCommercialOrderActivity(
  order: CommercialOrder,
): CommercialOrderActivity[] {
  const rows: CommercialOrderActivity[] = [
    {
      detail: `Commercial Order created by ${order.createdBy?.name ?? "Unknown team member"}.`,
      key: `created:${order.id}`,
      label: "Order received",
      time: formatCommerceDateTime(order.createdAt),
    },
  ]

  for (const payment of [...order.payments].sort(
    (left, right) =>
      new Date(left.recordedAt).getTime() -
      new Date(right.recordedAt).getTime(),
  )) {
    const amount = formatMinorMoney(payment.amountMinor, order.currencyCode)
    rows.push({
      detail: `${payment.type === "REFUND" ? "Refund" : "Payment"} of ${amount} by ${commerceStatusLabel(payment.method)}${payment.reference ? ` · ${payment.reference}` : ""} · ${payment.type === "REFUND" ? "Recorded" : "Received"} by ${payment.recordedBy?.name ?? "Unknown team member"}.`,
      key: `payment:${payment.id}`,
      label: payment.type === "REFUND" ? "Refund recorded" : "Payment recorded",
      time: formatCommerceDateTime(payment.recordedAt),
    })
  }

  for (const line of order.lines) {
    for (const fulfilment of line.productFulfillments) {
      rows.push({
        detail: `${formatCommerceQuantity(fulfilment.quantity)} × ${commerceLineTitle(line)} fulfilled from reserved stock.`,
        key: `fulfilment:${fulfilment.id}`,
        label: "Product fulfilled",
        time: "Recorded",
      })
    }
    for (const productReturn of line.productReturns) {
      rows.push({
        detail: `${formatCommerceQuantity(productReturn.quantity)} × ${commerceLineTitle(line)} returned · ${commerceStatusLabel(productReturn.disposition)}.`,
        key: `return:${productReturn.id}`,
        label: "Product returned",
        time: "Recorded",
      })
    }
  }

  return rows
}
