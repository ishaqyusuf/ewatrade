import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { effectiveCommercialAmountPaid } from "../commercial-payments"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError, assertFinancePostingDate } from "../finance/rules"
import { reviewAllocationReleaseSource } from "./allocation-release-review-source"
import { customerCreditBillingCommandId } from "./billing-reclassification"
import { getCustomerFundsReservedInTransaction } from "./funds-reservations"

const MAX_SOURCES = 50
const CASH_RETURN_LIMIT = 100_000_000n
export type CustomerOrderReturnUnavailableReason =
  | "CUSTOMER_REQUIRED"
  | "FINANCE_BOOK_REQUIRED"
  | "CUSTOMER_ACCOUNT_REQUIRED"
  | "CLOSED_PERIOD"
  | "BOOK_DATE_UNAVAILABLE"
  | "SOURCE_RECONCILIATION_REQUIRED"
  | "SOURCE_LIMIT_EXCEEDED"
export type CustomerOrderReturnCreditSource = {
  allocationId: string
  originalAllocationId: string
  creditEntryId: string
  remainingMinor: string
  sourceKind: "BILLED" | "UNBILLED"
  effectiveAt: Date
}

/** Current read-only review. Never ensures an account; the write repeats authority/locks/revision/source checks. */
export function getCustomerOrderReturnReview(
  db: PrismaClient,
  input: FinanceActor & { orderId: string },
) {
  return db.$transaction(
    (tx) => getCustomerOrderReturnReviewInTransaction(tx, input),
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
export async function getCustomerOrderReturnReviewInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { orderId: string },
) {
  await assertFinanceManager(tx, input)
  const order = await tx.commercialOrder.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
    include: { customer: { select: { id: true, name: true } } },
  })
  if (!order)
    throw new FinanceError("NOT_FOUND", "Order not found in this business.")
  const unavailable = (reason: CustomerOrderReturnUnavailableReason) => ({
    status: "UNAVAILABLE" as const,
    reason,
    orderId: order.id,
    orderNumber: order.orderNumber,
  })
  if (!order.customerId || !order.customer)
    return unavailable("CUSTOMER_REQUIRED")
  const [book, account] = await Promise.all([
    tx.financeBook.findUnique({
      where: {
        tenantId_currencyCode: {
          tenantId: input.tenantId,
          currencyCode: order.currencyCode,
        },
      },
    }),
    tx.customerLedgerAccount.findUnique({
      where: {
        tenantId_customerId_currencyCode: {
          tenantId: input.tenantId,
          customerId: order.customerId,
          currencyCode: order.currencyCode,
        },
      },
    }),
  ])
  if (!book) return unavailable("FINANCE_BOOK_REQUIRED")
  if (!account) return unavailable("CUSTOMER_ACCOUNT_REQUIRED")
  const now = new Date()
  try {
    assertFinancePostingDate({
      effectiveAt: now,
      startsAt: book.startsAt,
      closedThrough: book.closedThrough,
      now,
    })
  } catch (error) {
    if (error instanceof FinanceError)
      return unavailable(
        error.code === "CLOSED_PERIOD"
          ? "CLOSED_PERIOD"
          : "BOOK_DATE_UNAVAILABLE",
      )
    throw error
  }
  const [payments, candidates, reserved] = await Promise.all([
    tx.commercialOrderPayment.findMany({
      where: { tenantId: input.tenantId, orderId: order.id },
      select: { amountMinor: true, method: true, type: true },
    }),
    // Same current sequence/release projection as allocation history. Billing
    // lineage resolves the immutable original Order payment to its replacement.
    tx.$queryRaw<
      Array<{
        originalAllocationId: string
        allocationId: string
        remainingMinor: string
        reclassCommandId: string | null
      }>
    >`
      SELECT original.id AS "originalAllocationId", current_allocation.id AS "allocationId",
        (current_allocation."amountMinor" - COALESCE(released.amount,0))::text AS "remainingMinor",
        reclass."clientCommandId" AS "reclassCommandId"
      FROM "CommercialOrderPayment" payment
      JOIN "CustomerLedgerAllocation" original ON original.id = payment."customerAllocationId" AND original."accountId" = ${account.id}
      LEFT JOIN LATERAL (
        SELECT command."clientCommandId", command.result FROM "CustomerLedgerCommand" command
        WHERE command."tenantId" = ${input.tenantId} AND command."accountId" = ${account.id}
          AND command.kind = 'RECLASSIFY_UNBILLED_CREDIT' AND command.result->'audit'->>'originalAllocationId' = original.id
        ORDER BY command."createdAt" DESC LIMIT 1
      ) reclass ON TRUE
      JOIN "CustomerLedgerAllocation" current_allocation ON current_allocation.id = COALESCE(reclass.result->>'id',original.id) AND current_allocation."accountId" = ${account.id}
      LEFT JOIN LATERAL (SELECT SUM(release."amountMinor") AS amount FROM "CustomerLedgerAllocationRelease" release WHERE release."allocationId" = current_allocation.id AND release.sequence <= ${account.lastSequence}) released ON TRUE
      WHERE payment."tenantId" = ${input.tenantId} AND payment."orderId" = ${order.id}
        AND payment.method = 'CUSTOMER_CREDIT' AND payment.type = 'PAYMENT'
        AND original.sequence <= ${account.lastSequence} AND current_allocation.sequence <= ${account.lastSequence}
        AND current_allocation."amountMinor" - COALESCE(released.amount,0) > 0
      ORDER BY current_allocation.sequence, current_allocation.id LIMIT ${MAX_SOURCES + 1}
    `,
    getCustomerFundsReservedInTransaction(tx, { accountId: account.id }),
  ])
  if (candidates.length > MAX_SOURCES)
    return unavailable("SOURCE_LIMIT_EXCEEDED")
  const creditSources: CustomerOrderReturnCreditSource[] = []
  const seen = new Set<string>()
  try {
    for (const candidate of candidates) {
      if (
        candidate.reclassCommandId &&
        candidate.reclassCommandId !==
          customerCreditBillingCommandId(candidate.originalAllocationId)
      )
        return unavailable("SOURCE_RECONCILIATION_REQUIRED")
      if (seen.has(candidate.allocationId)) continue
      const amount = BigInt(candidate.remainingMinor)
      if (amount <= 0n) return unavailable("SOURCE_RECONCILIATION_REQUIRED")
      // Reuse the canonical correction preview, including current scoped Order,
      // provenance, control accounts and unbilled custody posting checks.
      const source = await reviewAllocationReleaseSource(
        tx,
        {
          ...input,
          bookId: book.id,
          accountId: account.id,
          allocationId: candidate.allocationId,
          amountMinor: amount.toString(),
        },
        book,
        account,
        amount,
      )
      if (
        source.order?.id !== order.id ||
        source.order.storeId !== order.storeId ||
        source.allocation.id !== candidate.allocationId ||
        source.remaining !== amount
      )
        return unavailable("SOURCE_RECONCILIATION_REQUIRED")
      seen.add(source.allocation.id)
      creditSources.push({
        allocationId: source.allocation.id,
        originalAllocationId: candidate.originalAllocationId,
        creditEntryId: source.allocation.creditEntryId,
        remainingMinor: amount.toString(),
        sourceKind: source.unbilled ? "UNBILLED" : "BILLED",
        effectiveAt: source.allocation.createdAt,
      })
    }
  } catch (error) {
    if (error instanceof FinanceError)
      return unavailable("SOURCE_RECONCILIATION_REQUIRED")
    throw error
  }
  const paid = BigInt(
    effectiveCommercialAmountPaid({ ...order, paymentCount: payments.length }),
  )
  const cash = payments.reduce(
    (sum, payment) =>
      payment.method === "CUSTOMER_CREDIT"
        ? sum
        : sum +
          BigInt(
            payment.type === "PAYMENT"
              ? payment.amountMinor
              : -payment.amountMinor,
          ),
    0n,
  )
  const credit = creditSources.reduce(
    (sum, source) => sum + BigInt(source.remainingMinor),
    0n,
  )
  if (cash < 0n || credit < 0n || reserved < 0n || cash + credit !== paid)
    return unavailable("SOURCE_RECONCILIATION_REQUIRED")
  return {
    status: "AVAILABLE" as const,
    orderId: order.id,
    orderNumber: order.orderNumber,
    storeId: order.storeId,
    customerId: order.customerId,
    customerName: order.customer.name,
    currencyCode: order.currencyCode,
    bookId: book.id,
    accountId: account.id,
    accountRevision: account.revision.toString(),
    orderPaidMinor: paid.toString(),
    ordinaryCashMaxMinor: (cash > CASH_RETURN_LIMIT
      ? CASH_RETURN_LIMIT
      : cash
    ).toString(),
    ordinaryCashRemainingMinor: cash.toString(),
    creditMaxMinor: credit.toString(),
    reservedCreditMinor: reserved.toString(),
    canReturn: cash > 0n || credit > 0n,
    creditSources,
  }
}
