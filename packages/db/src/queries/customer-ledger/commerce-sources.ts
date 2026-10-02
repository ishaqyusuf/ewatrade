import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import type { CommerceFinanceSource } from "../finance/commerce-posting-source"
import { FinanceError } from "../finance/rules"

const zero = BigInt(0)
const min = (left: bigint, right: bigint) => (left < right ? left : right)

/** Called after the source journal within the same book-locked transaction. */
export async function recordCommerceCustomerLedgerInTransaction(
  tx: Prisma.TransactionClient,
  source: CommerceFinanceSource,
  book: FinanceBook,
) {
  if (source.event === "EARNED") return null
  const order = await tx.commercialOrder.findFirst({
    where: { id: source.orderId, tenantId: source.tenantId },
  })
  if (!order?.customerId) return null
  if (
    order.tenantId !== book.tenantId ||
    order.currencyCode !== book.currencyCode
  )
    throw new FinanceError(
      "CONFLICT",
      "Customer source and financial book must match.",
    )
  const payment =
    source.event === "PAYMENT"
      ? await tx.commercialOrderPayment.findFirst({
          where: {
            id: source.paymentId,
            tenantId: source.tenantId,
            orderId: order.id,
          },
        })
      : null
  if (source.event === "PAYMENT" && !payment)
    throw new FinanceError("NOT_FOUND", "Customer payment source not found.")
  if (payment?.method === "CUSTOMER_CREDIT") return null
  const account = await tx.customerLedgerAccount.upsert({
    where: {
      tenantId_customerId_currencyCode: {
        tenantId: source.tenantId,
        customerId: order.customerId,
        currencyCode: order.currencyCode,
      },
    },
    create: {
      tenantId: source.tenantId,
      customerId: order.customerId,
      currencyCode: order.currencyCode,
    },
    update: {},
  })
  await tx.$queryRaw`SELECT id FROM "CustomerLedgerAccount" WHERE id = ${account.id} FOR UPDATE`
  const isRefund = payment?.type === "REFUND"
  const sourceKind = payment ? "COMMERCIAL_PAYMENT" : "COMMERCIAL_ORDER_BILLED"
  const sourceId = payment?.id ?? order.id
  const kind = payment
    ? isRefund
      ? "REFUND"
      : "ORDER_PAYMENT"
    : "ORDER_CHARGE"
  const side = payment && !isRefund ? "CREDIT" : "DEBIT"
  const amount = BigInt(payment?.amountMinor ?? order.totalMinor)
  const effectiveAt = payment?.recordedAt ?? order.createdAt
  const actorUserId = payment?.recordedByUserId ?? order.createdByUserId
  const previous = await tx.customerLedgerEntry.findUnique({
    where: {
      tenantId_sourceKind_sourceId: {
        tenantId: source.tenantId,
        sourceKind,
        sourceId,
      },
    },
  })
  if (previous) {
    if (
      previous.accountId !== account.id ||
      previous.kind !== kind ||
      previous.side !== side ||
      previous.amountMinor !== amount ||
      previous.effectiveAt.getTime() !== effectiveAt.getTime()
    )
      throw new FinanceError(
        "CONFLICT",
        "Customer source has already posted with different facts.",
      )
    return { id: previous.id }
  }
  if (amount <= zero)
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Customer source amount must be positive.",
    )
  const charge = payment
    ? await tx.customerLedgerEntry.findFirst({
        where: {
          accountId: account.id,
          orderId: order.id,
          kind: "ORDER_CHARGE",
          sourceKind: "COMMERCIAL_ORDER_BILLED",
          sourceId: order.id,
        },
      })
    : null
  if (payment && !charge)
    throw new FinanceError(
      "CONFLICT",
      "Post the customer's Order charge before its payment activity.",
    )
  const updated = await tx.customerLedgerAccount.update({
    where: { id: account.id },
    data: { lastSequence: { increment: 1 }, revision: { increment: 1 } },
  })
  // All effects of one source event share a sequence, so historical snapshots
  // cannot expose a credit before its automatic allocation or half a refund.
  const sequence = updated.lastSequence
  const entry = await tx.customerLedgerEntry.create({
    data: {
      tenantId: source.tenantId,
      accountId: account.id,
      sequence,
      kind,
      side,
      amountMinor: amount,
      sourceKind,
      sourceId,
      orderId: order.id,
      storeId: order.storeId,
      actorUserId,
      effectiveAt,
      description: `${isRefund ? "Money returned" : payment ? "Money received" : "Order billed"}: ${order.orderNumber}`,
    },
    select: { id: true },
  })
  if (!payment || !charge) return entry
  if (!isRefund) {
    const allocations = await tx.customerLedgerAllocation.findMany({
      where: { accountId: account.id, chargeEntryId: charge.id },
      include: { releases: true },
    })
    const settled = allocations.reduce(
      (sum, allocation) =>
        sum +
        allocation.amountMinor -
        allocation.releases.reduce(
          (released, release) => released + release.amountMinor,
          zero,
        ),
      zero,
    )
    if (amount > charge.amountMinor - settled)
      throw new FinanceError(
        "CONFLICT",
        "Payment exceeds the customer's unsettled Order charge.",
      )
    await tx.customerLedgerAllocation.create({
      data: {
        accountId: account.id,
        sequence,
        creditEntryId: entry.id,
        chargeEntryId: charge.id,
        amountMinor: amount,
        actorUserId,
      },
    })
    return entry
  }
  const credits = await tx.customerLedgerEntry.findMany({
    where: {
      accountId: account.id,
      orderId: order.id,
      kind: "ORDER_PAYMENT",
      side: "CREDIT",
      reversals: { none: {} },
    },
    include: { creditsUsed: { include: { releases: true } } },
    orderBy: { sequence: "asc" },
  })
  let remaining = amount
  for (const credit of credits) {
    if (remaining === zero) break
    const allocations = credit.creditsUsed.map((allocation) => ({
      ...allocation,
      remaining:
        allocation.amountMinor -
        allocation.releases.reduce(
          (sum, release) => sum + release.amountMinor,
          zero,
        ),
    }))
    const available =
      credit.amountMinor -
      allocations.reduce((sum, allocation) => sum + allocation.remaining, zero)
    if (
      available < zero ||
      allocations.some((allocation) => allocation.remaining < zero)
    )
      throw new FinanceError(
        "CONFLICT",
        "Customer settlement history requires reconciliation.",
      )
    let consumed = min(available, remaining)
    remaining -= consumed
    for (const allocation of allocations) {
      if (remaining === zero) break
      if (
        allocation.chargeEntryId !== charge.id ||
        allocation.remaining === zero
      )
        continue
      const released = min(allocation.remaining, remaining)
      await tx.customerLedgerAllocationRelease.create({
        data: {
          allocationId: allocation.id,
          sequence,
          amountMinor: released,
          actorUserId,
          reason: `Money returned on Order ${order.orderNumber}; payment ${payment.id}`,
        },
      })
      consumed += released
      remaining -= released
    }
    if (consumed > zero)
      await tx.customerLedgerAllocation.create({
        data: {
          accountId: account.id,
          sequence,
          creditEntryId: credit.id,
          chargeEntryId: entry.id,
          amountMinor: consumed,
          actorUserId,
        },
      })
  }
  if (remaining !== zero)
    throw new FinanceError(
      "CONFLICT",
      "Release this Order's collected funds from other charges before returning money.",
    )
  return entry
}
