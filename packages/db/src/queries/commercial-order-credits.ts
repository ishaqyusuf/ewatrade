import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { orderAmendmentDigest as digest } from "./commercial-order-amendment-evidence"
import { assessOrderCreditEligibility } from "./commercial-order-amendment-policy"
import { getCommercialOrderAmendmentEligibility } from "./commercial-order-amendment-review"
import {
  type ReturnCommercialOrderProductLineInput,
  returnCommercialOrderProductLineInTransaction,
} from "./commercial-orders"
import {
  type CommercialPaymentMethodValue,
  effectiveCommercialAmountPaid,
  recordCommercialOrderPaymentInTransaction,
} from "./commercial-payments"
import { lockCommerceFinancialOrder } from "./customer-ledger/commerce-locks"
import { runInOwnTransaction } from "./own-transaction"

type Scope = { tenantId: string; storeId: string; orderId: string }
type Money = { method: CommercialPaymentMethodValue; reference?: string }

function assertCommand(input: {
  actorUserId: string
  clientOperationId: string
  reason: string
}) {
  if (
    !input.actorUserId.trim() ||
    !input.clientOperationId.trim() ||
    input.clientOperationId.length > 120 ||
    !input.reason.trim() ||
    input.reason.trim().length > 500
  )
    throw new CatalogError(
      "INVALID_ORDER",
      "A command identity and a short reason are required.",
    )
}

async function assertCreditAllowed(tx: Prisma.TransactionClient, scope: Scope) {
  const review = await getCommercialOrderAmendmentEligibility(tx, scope)
  const assessment = assessOrderCreditEligibility(review.evidence)
  if (!assessment.eligible)
    throw new CatalogError(
      "INVALID_ORDER",
      assessment.blockers.map((block) => block.reason).join(" "),
    )
}

/** Lowers what the order asks for; the order is already locked by the caller. */
async function applyCredit(
  tx: Prisma.TransactionClient,
  input: Scope & {
    actorUserId: string
    amountMinor: number
    clientOperationId: string
    kind: "OVERCHARGE" | "RETURNED_ITEMS"
    payloadHash: string
    productReturnIds?: string[]
    reason: string
  },
) {
  const order = await tx.commercialOrder.findFirstOrThrow({
    where: { id: input.orderId, tenantId: input.tenantId },
    select: { totalMinor: true, creditMinor: true },
  })
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0 ||
    input.amountMinor > order.totalMinor
  )
    throw new CatalogError(
      "INVALID_ORDER",
      "A credit must be more than zero and no more than the order total.",
    )
  await tx.commercialOrder.update({
    where: { id: input.orderId },
    data: {
      totalMinor: order.totalMinor - input.amountMinor,
      creditMinor: order.creditMinor + input.amountMinor,
    },
  })
  return tx.commercialOrderCredit.create({
    data: {
      tenantId: input.tenantId,
      orderId: input.orderId,
      clientOperationId: input.clientOperationId,
      payloadHash: input.payloadHash,
      kind: input.kind,
      amountMinor: input.amountMinor,
      reason: input.reason.trim(),
      actorUserId: input.actorUserId,
      productReturnIds: input.productReturnIds ?? [],
    },
  })
}

/** Re-derives payment status after a credit changed the total without moving money. */
async function settlePaymentStatus(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const order = await tx.commercialOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: { select: { id: true } } },
  })
  const paid = effectiveCommercialAmountPaid({
    amountPaidMinor: order.amountPaidMinor,
    paymentCount: order.payments.length,
    paymentStatus: order.paymentStatus,
    totalMinor: order.totalMinor,
  })
  const paymentStatus =
    order.totalMinor === 0 && paid === 0 && order.payments.length > 0
      ? "REFUNDED"
      : paid >= order.totalMinor
        ? "PAID"
        : paid > 0
          ? "PARTIALLY_PAID"
          : "PENDING"
  if (paymentStatus !== order.paymentStatus)
    await tx.commercialOrder.update({
      where: { id: orderId },
      data: { paymentStatus },
    })
}

async function lockedOrderInStore(tx: Prisma.TransactionClient, scope: Scope) {
  const locked = await lockCommerceFinancialOrder(tx, scope)
  if (!locked || locked.order.storeId !== scope.storeId)
    throw new CatalogError(
      "ORDER_NOT_FOUND",
      "Order not found for this business and Store.",
    )
  const order = await tx.commercialOrder.findUniqueOrThrow({
    where: { id: scope.orderId },
    include: { payments: { select: { id: true } } },
  })
  return {
    ...order,
    paid: effectiveCommercialAmountPaid({
      amountPaidMinor: order.amountPaidMinor,
      paymentCount: order.payments.length,
      paymentStatus: order.paymentStatus,
      totalMinor: order.totalMinor,
    }),
  }
}

async function replayCredit(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; clientOperationId: string; payloadHash: string },
) {
  const previous = await tx.commercialOrderCredit.findUnique({
    where: {
      tenantId_clientOperationId: {
        tenantId: input.tenantId,
        clientOperationId: input.clientOperationId,
      },
    },
  })
  if (previous && previous.payloadHash !== input.payloadHash)
    throw new CatalogError(
      "IDEMPOTENCY_MISMATCH",
      "This change identity was already used with different details.",
    )
  return previous
}

export type RefundCommercialOrderInput = Scope &
  Money & {
    actorUserId: string
    clientOperationId: string
    amountMinor: number
    reason: string
    /** The price was wrong: the total drops by the same amount. */
    lowerTotal: boolean
  }

/**
 * Gives money back. With `lowerTotal` (overcharged) the order's total drops by
 * the refund too, so nothing shows as owed again.
 */
export async function refundCommercialOrderInTransaction(
  tx: Prisma.TransactionClient,
  input: RefundCommercialOrderInput,
) {
  assertCommand(input)
  const { storeId: _store, ...payload } = input
  const payloadHash = digest({ ...payload, reason: input.reason.trim() })
  const previous = input.lowerTotal
    ? await replayCredit(tx, { ...input, payloadHash })
    : null
  if (previous) return { creditId: previous.id, replayed: true as const }
  const order = await lockedOrderInStore(tx, input)
  if (input.lowerTotal) {
    await assertCreditAllowed(tx, input)
    if (input.amountMinor > order.paid)
      throw new CatalogError(
        "INVALID_ORDER",
        "Refund cannot exceed the amount collected.",
      )
  }
  const credit = input.lowerTotal
    ? await applyCredit(tx, {
        ...input,
        kind: "OVERCHARGE",
        payloadHash,
      })
    : null
  const payment = await recordCommercialOrderPaymentInTransaction(tx, {
    actorUserId: input.actorUserId,
    amountMinor: input.amountMinor,
    clientPaymentId: `${input.clientOperationId}:refund`,
    method: input.method,
    note: input.reason,
    orderId: input.orderId,
    reference: input.reference,
    tenantId: input.tenantId,
    type: "refund",
  })
  if (credit) {
    await tx.commercialOrderCredit.update({
      where: { id: credit.id },
      data: { refundPaymentId: payment.id },
    })
    await settlePaymentStatus(tx, input.orderId)
  }
  return {
    creditId: credit?.id ?? null,
    paymentId: payment.id,
    replayed: false,
  }
}

export function refundCommercialOrder(
  db: PrismaClient,
  input: RefundCommercialOrderInput,
) {
  return runInOwnTransaction(db, (tx) =>
    refundCommercialOrderInTransaction(tx, input),
  )
}

export type ReturnCommercialOrderItemsInput = Scope & {
  actorUserId: string
  clientOperationId: string
  reason: string
  lines: Array<{
    orderLineId: string
    quantity: string
    disposition: ReturnCommercialOrderProductLineInput["disposition"]
  }>
  /** Credit the returned value; any overpayment that leaves goes back by this method. */
  money?: Money | null
}

/** What the returned quantities were sold for, from each line's own total. */
export function returnedValueMinor(
  lines: Array<{ quantity: string; totalMinor: number; returned: string }>,
) {
  return lines.reduce((sum, line) => {
    const sold = Number(line.quantity)
    const back = Number(line.returned)
    if (!(sold > 0) || !(back > 0)) return sum
    return sum + Math.round((line.totalMinor * back) / sold)
  }, 0)
}

/**
 * Several lines come back in one save. With `money`, the order's total drops
 * by their value and anything the customer had paid above the new total is
 * refunded.
 */
export async function returnCommercialOrderItemsInTransaction(
  tx: Prisma.TransactionClient,
  input: ReturnCommercialOrderItemsInput,
) {
  assertCommand(input)
  if (!input.lines.length || input.lines.length > 50)
    throw new CatalogError("INVALID_ORDER", "Choose what came back.")
  if (
    new Set(input.lines.map((line) => line.orderLineId)).size !==
    input.lines.length
  )
    throw new CatalogError("INVALID_ORDER", "Each item can appear once.")
  const { storeId: _store, ...payload } = input
  const payloadHash = digest({ ...payload, reason: input.reason.trim() })
  if (input.money) {
    const previous = await replayCredit(tx, { ...input, payloadHash })
    if (previous)
      return {
        creditId: previous.id,
        productReturnIds: previous.productReturnIds,
        refundPaymentId: previous.refundPaymentId,
        replayed: true as const,
      }
  }
  const order = await lockedOrderInStore(tx, input)
  if (input.money) await assertCreditAllowed(tx, input)
  const orderLines = await tx.commercialOrderLine.findMany({
    where: {
      id: { in: input.lines.map((line) => line.orderLineId) },
      orderId: order.id,
    },
    select: { id: true, quantity: true, totalMinor: true },
  })
  if (orderLines.length !== input.lines.length)
    throw new CatalogError("ORDER_NOT_FOUND", "Order item not found.")
  const returns = []
  for (const line of input.lines)
    returns.push(
      await returnCommercialOrderProductLineInTransaction(tx, {
        actorUserId: input.actorUserId,
        clientReturnId: `${input.clientOperationId}:${line.orderLineId}`,
        disposition: line.disposition,
        orderLineId: line.orderLineId,
        quantity: line.quantity,
        reason: input.reason,
        schemaVersion: 1,
        storeId: input.storeId,
        tenantId: input.tenantId,
      }),
    )
  if (!input.money)
    return {
      creditId: null,
      productReturnIds: returns.map((row) => row.id),
      refundPaymentId: null,
      replayed: false,
    }
  const value = Math.min(
    order.totalMinor,
    returnedValueMinor(
      input.lines.map((line) => {
        const sold = orderLines.find((row) => row.id === line.orderLineId)
        return {
          quantity: sold?.quantity.toString() ?? "0",
          totalMinor: sold?.totalMinor ?? 0,
          returned: line.quantity,
        }
      }),
    ),
  )
  if (value <= 0)
    throw new CatalogError(
      "INVALID_ORDER",
      "These items have no value to credit.",
    )
  const credit = await applyCredit(tx, {
    ...input,
    amountMinor: value,
    kind: "RETURNED_ITEMS",
    payloadHash,
    productReturnIds: returns.map((row) => row.id),
  })
  const refundMinor = Math.max(0, order.paid - (order.totalMinor - value))
  let refundPaymentId: string | null = null
  if (refundMinor > 0) {
    const payment = await recordCommercialOrderPaymentInTransaction(tx, {
      actorUserId: input.actorUserId,
      amountMinor: refundMinor,
      clientPaymentId: `${input.clientOperationId}:refund`,
      method: input.money.method,
      note: input.reason,
      orderId: input.orderId,
      reference: input.money.reference,
      tenantId: input.tenantId,
      type: "refund",
    })
    refundPaymentId = payment.id
    await tx.commercialOrderCredit.update({
      where: { id: credit.id },
      data: { refundPaymentId },
    })
  }
  await settlePaymentStatus(tx, input.orderId)
  return {
    creditId: credit.id,
    productReturnIds: returns.map((row) => row.id),
    refundPaymentId,
    replayed: false,
  }
}

export function returnCommercialOrderItems(
  db: PrismaClient,
  input: ReturnCommercialOrderItemsInput,
) {
  return runInOwnTransaction(db, (tx) =>
    returnCommercialOrderItemsInTransaction(tx, input),
  )
}
