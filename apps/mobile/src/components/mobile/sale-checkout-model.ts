import { majorToMinor, multiplyExactDecimals } from "@ewatrade/utils"

export type SalePaymentState = "paid" | "partially_paid" | "pending"

export function getSaleFulfillmentOption({
  deliveryDueAt,
  hasProductLines,
  now,
  requested,
}: {
  deliveryDueAt: Date
  hasProductLines: boolean
  now: Date
  requested: boolean
}) {
  if (!hasProductLines) {
    return {
      canFulfillNow: false,
      fulfillNow: false,
      reason: "Only Product lines use stock fulfillment.",
    }
  }
  if (deliveryDueAt.getTime() > now.getTime()) {
    return {
      canFulfillNow: false,
      fulfillNow: false,
      reason: "Fulfillment becomes available at the scheduled delivery time.",
    }
  }
  return {
    canFulfillNow: true,
    fulfillNow: requested,
    reason: null,
  }
}

export function saleLineTotalMinor(
  fixedPriceMinor: number | null,
  quantity: string | undefined,
) {
  if (fixedPriceMinor === null || !quantity?.trim()) return null

  try {
    const total = multiplyExactDecimals(
      String(fixedPriceMinor),
      quantity.trim(),
    )
    if (!/^\d+$/.test(total)) return null

    const value = Number(total)
    return Number.isSafeInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function salePaymentSummary(totalMinor: number, received: string) {
  const normalizedReceived = received.trim()
  const receivedMinor = normalizedReceived ? majorToMinor(received) : 0

  if (receivedMinor === null || receivedMinor < 0) {
    return {
      balanceDueMinor: totalMinor,
      error: "Enter a valid amount received.",
      paymentState: "pending" as SalePaymentState,
      receivedMinor: 0,
    }
  }
  if (receivedMinor > totalMinor) {
    return {
      balanceDueMinor: 0,
      error: "Amount received cannot exceed the order total.",
      paymentState: "paid" as SalePaymentState,
      receivedMinor,
    }
  }

  return {
    balanceDueMinor: totalMinor - receivedMinor,
    error: null,
    paymentState:
      receivedMinor === 0
        ? ("pending" as const)
        : receivedMinor === totalMinor
          ? ("paid" as const)
          : ("partially_paid" as const),
    receivedMinor,
  }
}
