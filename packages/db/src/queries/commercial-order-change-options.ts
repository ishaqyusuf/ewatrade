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
import {
  OPEN_ORDER_CHANGE_POLICY,
  ORDER_CHANGE_MANAGERS_ONLY,
  type OrderChangePolicyModes,
  type OrderChangeRequirement,
  orderChangeRequirement,
} from "./commercial-order-change-rules"
import type { OrderScope } from "./order-visibility"

export type CommercialOrderChangeOption = {
  allowed: boolean
  reason: string | null
}

const MANAGERS_ONLY = ORDER_CHANGE_MANAGERS_ONLY
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
    /** The Store's returns/refunds settings; Open when omitted. */
    policy?: OrderChangePolicyModes
    /** Owner or Admin: never asks, decides requests. */
    isApprover?: boolean
  },
) {
  const policy = input.policy ?? OPEN_ORDER_CHANGE_POLICY
  const actor = {
    canManageMoney: input.canAmend,
    isApprover: Boolean(input.isApprover),
  }
  const rule = (
    action: "return" | "refund",
    extra?: { withMoney?: boolean; cashBack?: boolean },
  ) => orderChangeRequirement(policy, { action, ...actor, ...extra })
  const returnRule = rule("return")
  const returnMoneyRule = rule("return", { withMoney: true })
  const cashBackRule = rule("return", { withMoney: true, cashBack: true })
  const refundRule = rule("refund")
  const asks = (requirement: OrderChangeRequirement) =>
    requirement.kind === "ask"
  const lockedBy = (requirement: OrderChangeRequirement) =>
    requirement.kind === "blocked" ? requirement.reason : null
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
      : returnRule.kind === "blocked"
        ? lock(returnRule.reason)
        : returnable.length
          ? allow()
          : order.lines.some((line) => line.productFulfillments.length)
            ? lock("Everything handed over is already returned")
            : order.lines.some((line) => line.serviceFulfillment)
              ? lock("Typed-price items have no stock to return")
              : lock("Nothing handed over yet")),
    lines: closed ? [] : returnable,
    /** This person asks an Owner/Admin before recording a return. */
    ask: asks(returnRule),
    /** Lowering the total with the return: asks, or why it is locked. */
    money: {
      ask: asks(returnMoneyRule),
      lockedReason: lockedBy(returnMoneyRule),
    },
    /** Paying money back with the return (Refunds setting). */
    cashBack: { ask: asks(cashBackRule), lockedReason: lockedBy(cashBackRule) },
  }
  const refund = {
    ...(refundRule.kind === "blocked"
      ? lock(refundRule.reason)
      : order.amountPaidMinor <= 0
        ? lock("Nothing paid yet")
        : allow()),
    refundableMinor: Math.max(0, order.amountPaidMinor),
    ask: asks(refundRule),
  }
  // Someone who asks first still needs to know whether the total may drop.
  const checkCredit =
    input.canAmend || asks(returnMoneyRule) || asks(refundRule)
  const base = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    refund,
    returnLine,
    // Whether a refund or return may also lower the total (an order credit).
    credit: lock("Checking…") as CommercialOrderChangeOption,
    policy: { ...policy, isApprover: actor.isApprover },
  }

  if (!input.canAmend) {
    const managers = lock(
      closed ? blockerReason([], order.status) : MANAGERS_ONLY,
    )
    return {
      ...base,
      credit: checkCredit
        ? await creditOption(
            db,
            { ...input, storeId: order.storeId },
            closed,
            order.status,
          )
        : managers,
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

/** Whether a refund or return may also lower the order's total. */
async function creditOption(
  db: PrismaClient,
  input: { tenantId: string; storeId: string; orderId: string },
  closed: boolean,
  status: string,
) {
  if (closed) return lock(blockerReason([], status))
  const review = await getCommercialOrderAmendmentEligibility(db, input)
  const credit = assessOrderCreditEligibility(review.evidence)
  return credit.eligible
    ? allow()
    : lock(blockerReason(credit.blockers, status))
}

export type CommercialOrderChangeOptions = Awaited<
  ReturnType<typeof getCommercialOrderChangeOptions>
>
