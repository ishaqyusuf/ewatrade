import {
  addExactDecimals,
  compareExactDecimals,
  formatMinorMoney,
} from "@ewatrade/utils"
import {
  type CommercialOrder,
  type CommercialOrderLine,
  commerceLineTitle,
  commerceStatusLabel,
  formatCommerceDateTime,
  formatCommerceQuantity,
} from "./commerce-model"

export type CommercialOrderActivityTone =
  | "ink"
  | "mint"
  | "sky"
  | "amber"
  | "lilac"
  | "rose"

export type CommercialOrderActivity = {
  detail: string
  key: string
  label: string
  time: string
  occurredAt?: Date | string
  tone?: CommercialOrderActivityTone
  /** Before → after rows for changes, replacements and released stock. */
  changes?: { label: string; before: string; after: string }[]
}

export function canFulfillCommercialOrderLine(line: CommercialOrderLine) {
  return (
    line.kind === "product" &&
    line.productFulfillments.length === 0 &&
    line.reservation?.status === "ACTIVE"
  )
}

/** How much of a handed-over product line came back, if any. */
export function commercialOrderLineReturnState(line: CommercialOrderLine) {
  const sum = (values: { quantity: string }[]) =>
    values.reduce(
      (total, value) => addExactDecimals(total, value.quantity),
      "0",
    )
  const returned = sum(line.productReturns)
  if (compareExactDecimals(returned, "0") <= 0) return null
  const handedOver = sum(line.productFulfillments)
  return compareExactDecimals(returned, handedOver) >= 0
    ? { all: true, label: "Returned" }
    : {
        all: false,
        label: `${formatCommerceQuantity(returned)} of ${formatCommerceQuantity(handedOver)} returned`,
      }
}

/** Typed-price lines are fulfilled by the all-lines command only. */
export function canFulfillCatalogFreeLine(line: CommercialOrderLine) {
  return Boolean(line.customLine) && !line.serviceFulfillment
}

export function getCommercialOrderOverviewSummary(order: CommercialOrder) {
  const itemCount = order.lines.reduce(
    (total, line) => total + Number(line.quantity),
    0,
  )
  const productLines = order.lines.filter((line) => line.kind === "product")
  // Typed-price lines have no stock or Job; "Fulfil" just records them done.
  const catalogFreeLines = order.lines.filter((line) => line.customLine)
  const serviceLines = order.lines.filter(
    (line) => line.kind === "service" && !line.customLine,
  )
  const fulfilledProductLines = productLines.filter(
    (line) => line.productFulfillments.length > 0,
  )
  const fulfilledCatalogFreeLines = catalogFreeLines.filter(
    (line) => line.serviceFulfillment,
  )
  const returns = productLines.flatMap(
    (line) => commercialOrderLineReturnState(line) ?? [],
  )
  const returnedLineCount = returns.filter((state) => state.all).length

  return {
    fulfilledProductLineCount:
      fulfilledProductLines.length + fulfilledCatalogFreeLines.length,
    fulfillableProductLineCount:
      productLines.filter(canFulfillCommercialOrderLine).length +
      catalogFreeLines.length -
      fulfilledCatalogFreeLines.length,
    itemCount,
    lineCount: order.lines.length,
    productLineCount: productLines.length + catalogFreeLines.length,
    /** Lines whose handed-over quantity all came back. */
    returnedLineCount,
    /** Lines where only part came back. */
    partReturnedLineCount: returns.length - returnedLineCount,
    serviceLineCount: serviceLines.length,
  }
}

/**
 * "Returned" once every handed-over line came back, "Part returned" when some
 * did, as the dashboard's fulfilment pill says; null while lines are still to
 * fulfil or nothing came back.
 */
export function commercialOrderReturnLabel(
  summary: ReturnType<typeof getCommercialOrderOverviewSummary>,
) {
  const total = summary.productLineCount
  if (!total || summary.fulfilledProductLineCount < total) return null
  if (summary.returnedLineCount === total) return "Returned"
  return summary.returnedLineCount + summary.partReturnedLineCount > 0
    ? "Part returned"
    : null
}

export function buildCommercialOrderActivity(
  order: CommercialOrder,
): CommercialOrderActivity[] {
  const rows: CommercialOrderActivity[] = [
    {
      detail: `Taken by ${order.createdBy?.name ?? "a team member"}`,
      key: `created:${order.id}`,
      occurredAt: order.createdAt,
      label: "Order created",
      time: formatCommerceDateTime(order.createdAt),
    },
  ]

  for (const payment of [...order.payments].sort(
    (left, right) =>
      new Date(left.recordedAt).getTime() -
      new Date(right.recordedAt).getTime(),
  )) {
    const amount = formatMinorMoney(payment.amountMinor, order.currencyCode)
    const creditSettlement = payment.method === "CUSTOMER_CREDIT"
    rows.push({
      detail: creditSettlement
        ? `${amount} of existing customer credit ${payment.type === "REFUND" ? "released" : "applied"} by ${payment.recordedBy?.name ?? "Unknown team member"}.`
        : `${payment.type === "REFUND" ? "Refund" : "Payment"} of ${amount} by ${commerceStatusLabel(payment.method)}${payment.reference ? ` · ${payment.reference}` : ""} · ${payment.type === "REFUND" ? "Recorded" : "Received"} by ${payment.recordedBy?.name ?? "Unknown team member"}.`,
      key: `payment:${payment.id}`,
      occurredAt: payment.recordedAt,
      label: creditSettlement
        ? payment.type === "REFUND"
          ? "Customer credit released"
          : "Customer credit applied"
        : payment.type === "REFUND"
          ? "Refund recorded"
          : "Payment recorded",
      time: formatCommerceDateTime(payment.recordedAt),
    })
  }

  for (const line of order.lines) {
    for (const fulfilment of line.productFulfillments) {
      rows.push({
        detail: `${formatCommerceQuantity(fulfilment.quantity)} × ${commerceLineTitle(line)} fulfilled from reserved stock.`,
        key: `fulfilment:${fulfilment.id}`,
        occurredAt: fulfilment.createdAt,
        label: "Product fulfilled",
        time: fulfilment.createdAt
          ? formatCommerceDateTime(fulfilment.createdAt)
          : "Time unavailable",
      })
    }
    if (line.customLine && line.serviceFulfillment)
      rows.push({
        detail: `${commerceLineTitle(line)} marked fulfilled.`,
        key: `custom-fulfilment:${line.serviceFulfillment.id}`,
        occurredAt: line.serviceFulfillment.performedAt,
        label: "Fulfilled",
        time: formatCommerceDateTime(line.serviceFulfillment.performedAt),
      })
    for (const productReturn of line.productReturns) {
      rows.push({
        detail: `${formatCommerceQuantity(productReturn.quantity)} × ${commerceLineTitle(line)} returned · ${commerceStatusLabel(productReturn.disposition)}.`,
        key: `return:${productReturn.id}`,
        occurredAt: productReturn.createdAt,
        label: "Product returned",
        time: productReturn.createdAt
          ? formatCommerceDateTime(productReturn.createdAt)
          : "Time unavailable",
      })
    }
  }

  if (order.status === "CANCELLED")
    rows.push({
      key: `cancelled:${order.id}`,
      label: "Order cancelled",
      detail:
        "This order is cancelled. Payment and fulfilment are unavailable.",
      time: "Time unavailable",
    })
  return rows.sort(
    (left, right) =>
      (left.occurredAt
        ? new Date(left.occurredAt).getTime()
        : Number.POSITIVE_INFINITY) -
      (right.occurredAt
        ? new Date(right.occurredAt).getTime()
        : Number.POSITIVE_INFINITY),
  )
}
