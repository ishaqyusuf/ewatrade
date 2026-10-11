import {
  addExactDecimals,
  compareExactDecimals,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import {
  type OrderAmendmentBlock,
  assessOrderCreditEligibility,
} from "./commercial-order-amendment-policy"
import { getCommercialOrderAmendmentEligibility } from "./commercial-order-amendment-review"
import type { OrderScope } from "./order-visibility"

export type CommercialOrderChangeOption = {
  allowed: boolean
  reason: string | null
}

const MANAGERS_ONLY = "Owners and managers only"
const INSTEAD = " · refund or return instead"

const allow = (): CommercialOrderChangeOption => ({
  allowed: true,
  reason: null,
})
const lock = (reason: string): CommercialOrderChangeOption => ({
  allowed: false,
  reason,
})

/** One plain reason for the first blocker an owner can act on. */
function blockerReason(blockers: OrderAmendmentBlock[], status: string) {
  const codes = new Set(blockers.map((block) => block.code))
  if (status === "CANCELLED") return "Order is cancelled"
  if (status === "REFUNDED") return "Order is refunded"
  if (codes.has("ORDER_CLOSED")) return "Order is closed"
  if (codes.has("PRESCRIPTION_SOURCE"))
    return "Prescription orders change in their own flow"
  if (codes.has("STORE_UNAVAILABLE")) return "This store is inactive"
  const money = codes.has("PAYMENT_HISTORY")
  const stock = codes.has("FULFILLMENT_HISTORY")
  if (money && stock) return "Money and stock have moved"
  if (money) return "Money has been received"
  if (stock) return "Items have been handed over"
  if (codes.has("ORDER_STATE")) return "Order has moved past confirmed"
  if (codes.has("LEDGER_SOURCE")) return "Recorded on the customer's account"
  if (codes.has("SERVICE_SOURCE")) return "Linked to service work"
  if (codes.has("QUOTE_SOURCE")) return "Comes from an accepted quote"
  if (codes.has("BOOKING_SOURCE")) return "Linked to a booking"
  return "Reload the order and try again"
}

/**
 * What the order screen may offer in its Change menu, with a short reason for
 * anything locked. Actor role arrives from the caller; every write still
 * rechecks under its own locks.
 */
export async function getCommercialOrderChangeOptions(
  db: PrismaClient,
  input: {
    tenantId: string
    scope: OrderScope
    orderId: string
    activeStoreId: string | null
    canAmend: boolean
  },
) {
  const order = await db.commercialOrder.findFirst({
    where: { ...input.scope, id: input.orderId, tenantId: input.tenantId },
    select: {
      id: true,
      orderNumber: true,
      storeId: true,
      status: true,
      amountPaidMinor: true,
      lines: {
        select: {
          id: true,
          productFulfillments: { select: { quantity: true } },
          productReturns: { select: { quantity: true } },
          serviceFulfillment: { select: { id: true } },
        },
      },
    },
  })
  if (!order)
    throw new CatalogError("ORDER_NOT_FOUND", "Commercial Order not found.")

  const closed = ["CANCELLED", "REFUNDED"].includes(order.status)
  const sum = (values: { quantity: { toString(): string } }[]) =>
    values.reduce(
      (total, value) => addExactDecimals(total, value.quantity.toString()),
      "0",
    )
  const returnable = order.lines.flatMap((line) => {
    const quantity = subtractExactDecimals(
      sum(line.productFulfillments),
      sum(line.productReturns),
    )
    return compareExactDecimals(quantity, "0") > 0
      ? [{ orderLineId: line.id, quantity }]
      : []
  })
  const returnLine = {
    ...(closed
      ? lock(
          order.status === "REFUNDED"
            ? "Order is refunded"
            : "Order is cancelled",
        )
      : returnable.length
        ? allow()
        : order.lines.some((line) => line.productFulfillments.length)
          ? lock("Everything handed over is already returned")
          : order.lines.some((line) => line.serviceFulfillment)
            ? lock("Typed-price items have no stock to return")
            : lock("Nothing handed over yet")),
    lines: closed ? [] : returnable,
  }
  const refund = {
    ...(!input.canAmend
      ? lock(MANAGERS_ONLY)
      : order.amountPaidMinor <= 0
        ? lock("Nothing paid yet")
        : allow()),
    refundableMinor: Math.max(0, order.amountPaidMinor),
  }
  const base = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    refund,
    returnLine,
    // Whether a refund or return may also lower the total (an order credit).
    credit: lock("Checking…") as CommercialOrderChangeOption,
  }

  if (!input.canAmend) {
    const managers = lock(
      closed ? blockerReason([], order.status) : MANAGERS_ONLY,
    )
    return {
      ...base,
      credit: managers,
      customer: managers,
      details: managers,
      items: managers,
      cancel: managers,
    }
  }
  if (!input.activeStoreId || input.activeStoreId !== order.storeId) {
    const store = lock("Switch to this order's store to change it")
    return {
      ...base,
      credit: store,
      customer: store,
      details: store,
      items: store,
      cancel: store,
    }
  }

  const review = await getCommercialOrderAmendmentEligibility(db, {
    tenantId: input.tenantId,
    storeId: order.storeId,
    orderId: order.id,
  })
  const ordinary = review.eligibility.eligibleForOrdinaryAmendment
    ? allow()
    : lock(blockerReason(review.eligibility.blockers, order.status))
  const insteadOf = (option: CommercialOrderChangeOption) =>
    !option.allowed &&
    review.eligibility.blockers.some(
      (block) => block.requiredWorkflow === "return_refund",
    ) &&
    !closed
      ? lock(`${option.reason}${INSTEAD}`)
      : option
  const credit = assessOrderCreditEligibility(review.evidence)
  return {
    ...base,
    credit: credit.eligible
      ? allow()
      : lock(blockerReason(credit.blockers, order.status)),
    customer: ordinary,
    details: review.detailsEligibility.eligible
      ? allow()
      : lock(blockerReason(review.detailsEligibility.blockers, order.status)),
    items: insteadOf(ordinary),
    cancel: insteadOf(ordinary),
  }
}

export type CommercialOrderChangeOptions = Awaited<
  ReturnType<typeof getCommercialOrderChangeOptions>
>
