import {
  type GeneralAnswer,
  generalDateRange,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"

type Money = number | bigint | string
export type GeneralOrderFact = {
  id: string
  orderNumber: string
  currencyCode: string
  totalMinor: Money
  balanceDueMinor: Money
  status: string
  paymentStatus: string
  customerName?: string | null
  createdAt?: Date | string
}
type GeneralOrderReadFact = GeneralOrderFact & {
  lines?: Array<{
    quantity: string
    totalMinor: Money
    snapshot?: {
      catalogItemName?: string | null
      variantName?: string | null
      offeringName?: string | null
      inventoryUnitName?: string | null
    } | null
    customLine?: { description?: string | null; kind?: string } | null
  }>
  payments?: Array<{
    amountMinor: Money
    method: string
    type: string
    recordedAt: Date | string
    reference?: string | null
  }>
}
function label(value: string, max: number) {
  if (value.length <= max) return value
  let result = ""
  for (const { segment } of new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(value)) {
    if (result.length + segment.length > max - 1) break
    result += segment
  }
  return `${result}…`
}
function money(value: Money, currency: string) {
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw Error("Exact recorded amount unavailable.")
  return generalMoney(value, currency)
}
function time(value: Date | string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : "time unavailable"
}
export function generalOrderAnswer(
  order: GeneralOrderFact,
  storeName: string,
  asOf = new Date().toISOString(),
): GeneralAnswer {
  const excluded = ["CANCELLED", "REFUNDED"].includes(order.status)
  const unpaid = excluded ? 0 : order.balanceDueMinor
  return {
    id: `order_${crypto.randomUUID()}`,
    title: label(order.orderNumber, 160),
    value: money(order.totalMinor, order.currencyCode),
    scope: label(storeName, 300),
    asOf,
    detail: `${order.status} · ${order.paymentStatus} · unpaid ${money(unpaid, order.currencyCode)}. ${excluded ? "Cancelled/refunded orders contribute no unpaid amount. " : ""}${order.customerName ? `Customer ${label(order.customerName, 120)}. ` : ""}${order.createdAt ? `Created ${time(order.createdAt)}. ` : ""}Individual order only; use the summary read for totals.`,
  }
}

/** All authorized rows are preserved; this is a page, never an inferred aggregate. */
export function generalOrderPageAnswers(
  page: { items: GeneralOrderFact[]; nextCursor?: string | null },
  input: {
    storeName: string
    createdAfter?: string
    createdBefore?: string
    query?: string
    queryMode?: "all" | "customer"
    statuses?: readonly string[]
    cursor?: string
    ownOrders?: boolean
    asOf?: string
  },
): GeneralAnswer[] {
  if (page.items.length > 50)
    throw Error("Order answer page exceeds its bound.")
  const asOf = input.asOf ?? new Date().toISOString()
  const scope = label(
    `${input.storeName} · ${input.ownOrders ? "Your orders" : "Authorized orders"} · ${generalDateRange(input.createdAfter, input.createdBefore)}`,
    500,
  )
  return [
    {
      id: `orders_${crypto.randomUUID()}`,
      title: "Orders",
      value: `${page.items.length} on this page`,
      scope,
      asOf,
      detail: `${page.nextCursor ? "More results are available. " : "End of this live result page. "}${input.cursor ? "Continuation page" : "First page"}; not a business total. Created from ${input.createdAfter ?? "any start"} (inclusive) to ${input.createdBefore ?? "any end"} (exclusive); explicit instants, display dates in UTC. Search: ${label(input.query ?? "none", 160)} (${input.queryMode ?? "all"}); statuses: ${input.statuses?.join(", ") ?? "all"}. Matching orders are listed separately; choose the exact order when names match more than one record.`,
    },
    ...page.items.map((order) => ({
      ...generalOrderAnswer(order, input.storeName, asOf),
      scope,
    })),
  ]
}

/** Existing order detail already owns these original facts; no additional read or effect. */
export function generalOrderReadAnswers(
  order: GeneralOrderReadFact,
  storeName: string,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  const answers = [generalOrderAnswer(order, storeName, asOf)]
  if (order.lines) {
    const shown = order.lines.slice(0, 10)
    answers.push({
      id: `order_lines_${crypto.randomUUID()}`,
      title: `${label(order.orderNumber, 120)} · items`,
      value: `${shown.length} of ${order.lines.length} lines shown`,
      scope: label(storeName, 500),
      asOf,
      detail: `${order.lines.length > shown.length ? "More original lines are not shown; open the order for the complete list. " : "All original lines on this order are shown. "}Original booked quantities, units and line values; not fulfilled quantities, stock availability, net returns or a sales total.`,
    })
    for (const [index, line] of shown.entries()) {
      const unit = line.snapshot?.inventoryUnitName || "unit not recorded"
      const prefix = `${line.quantity} `
      if (prefix.length > 130)
        throw Error("Exact recorded quantity unavailable.")
      const fullValue = `${prefix}${unit}`
      const shortened = fullValue.length > 160
      answers.push({
        id: `order_line_${crypto.randomUUID()}`,
        title: label(
          `${index + 1}. ${line.snapshot?.catalogItemName || line.customLine?.description || "Original order line"}`,
          160,
        ),
        value: `${prefix}${label(unit, 160 - prefix.length)}`,
        scope: label(`${storeName} · ${order.orderNumber}`, 500),
        asOf,
        detail: `${shortened ? "Unit label shortened; open the original order for its full name. " : ""}Original line value ${money(line.totalMinor, order.currencyCode)}. ${line.snapshot?.variantName ? `Variant ${label(line.snapshot.variantName, 120)}. ` : ""}${line.snapshot?.offeringName ? `Offering ${label(line.snapshot.offeringName, 160)}. ` : ""}Quantity and unit are original saved facts; no conversion or available stock inferred.`,
      })
    }
  }
  if (order.payments) {
    const shown = order.payments.slice(-10)
    answers.push({
      id: `order_payments_${crypto.randomUUID()}`,
      title: `${label(order.orderNumber, 120)} · recorded payments`,
      value: `${shown.length} of ${order.payments.length} records shown`,
      scope: label(storeName, 500),
      asOf,
      detail: `${order.payments.length > shown.length ? "Only the last ten saved payment/refund records are shown; earlier records remain in the order. " : "All saved payment/refund records on this order are shown. "}These are recorded facts, not bank settlement or cash-count verification. Customer credit is separate from money received; this list is not a collections total.`,
    })
    for (const payment of shown) {
      const credit = payment.method === "CUSTOMER_CREDIT"
      const refund = payment.type === "REFUND"
      answers.push({
        id: `order_payment_${crypto.randomUUID()}`,
        title: credit
          ? refund
            ? "Recorded customer-credit reversal"
            : "Recorded customer-credit application"
          : refund
            ? "Recorded refund"
            : "Recorded payment",
        value: money(payment.amountMinor, order.currencyCode),
        scope: label(`${storeName} · ${order.orderNumber}`, 500),
        asOf,
        detail: `Recorded at ${time(payment.recordedAt)} · ${credit ? "customer credit (not new money received)" : label(payment.method.replaceAll("_", " ").toLowerCase(), 80)}.${payment.reference ? ` Reference ${label(payment.reference, 160)}.` : ""} ${refund ? "Refund record; this amount is not added to receipts." : "Recorded against this order only."} No provider settlement or physical cash verification is implied.`,
      })
    }
  }
  return answers
}
