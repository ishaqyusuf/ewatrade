import type { Prisma } from "../../../generated/prisma/client"
import { assertFinanceManager, type FinanceActor } from "../finance/access"
import {
  FinanceError,
  financeAmount,
  assertFinancePostingDate,
} from "../finance/rules"
import { getCustomerLedgerTotalsInTransaction } from "./balances"
import { reviewCreditAllocationSource } from "./allocation-source-review"
import { reviewAllocationReleaseSource } from "./allocation-release-review-source"
import type { ApplyCustomerLedgerCreditInput } from "./allocations"
import type { ReleaseCustomerLedgerAllocationInput } from "./allocation-releases"

async function context(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string; accountId: string },
) {
  await assertFinanceManager(tx, input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  const account = await tx.customerLedgerAccount.findFirst({
    where: { id: input.accountId, tenantId: input.tenantId },
    include: { customer: { select: { name: true } } },
  })
  if (!book || !account)
    throw new FinanceError(
      "NOT_FOUND",
      "Financial Book or customer account not found in this business.",
    )
  if (book.currencyCode !== account.currencyCode)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Customer and financial book currency must match.",
    )
  const now = new Date()
  assertFinancePostingDate({
    effectiveAt: now,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now,
  })
  return { book, account }
}

/** Advisory preview; canonical execution repeats source checks under Book/account/Order locks. */
export async function getCustomerCreditAllocationReview(
  tx: Prisma.TransactionClient,
  input: Omit<
    ApplyCustomerLedgerCreditInput,
    "clientCommandId" | "expectedRevision"
  >,
) {
  const { book, account } = await context(tx, input)
  const amount = financeAmount(input.amountMinor)
  const source = await reviewCreditAllocationSource(
    tx,
    input,
    book,
    account,
    amount,
  )
  return {
    bookId: book.id,
    accountId: account.id,
    customerId: account.customerId,
    customerName: account.customer.name,
    currencyCode: book.currencyCode,
    accountRevision: account.revision.toString(),
    amountMinor: amount.toString(),
    creditEntryId: source.credit.id,
    creditKind: source.credit.kind,
    chargeEntryId: source.charge.id,
    chargeKind: source.charge.kind,
    sourceCreditBeforeMinor: source.creditRemaining.toString(),
    sourceCreditAfterMinor: (source.creditRemaining - amount).toString(),
    sourceDebtBeforeMinor: source.debtRemaining.toString(),
    sourceDebtAfterMinor: (source.debtRemaining - amount).toString(),
    orderId: source.order?.id ?? null,
    orderNumber: source.order?.orderNumber ?? null,
    effect: "APPLY_EXISTING_CREDIT" as const,
    monetaryCollection: "NOT_PERFORMED" as const,
  }
}

/** Releases an allocation, restoring debt/credit; never returns money to a customer. */
export async function getCustomerAllocationReleaseReview(
  tx: Prisma.TransactionClient,
  input: Omit<
    ReleaseCustomerLedgerAllocationInput,
    "clientCommandId" | "expectedRevision"
  >,
) {
  const { book, account } = await context(tx, input)
  const amount = financeAmount(input.amountMinor)
  if (!input.reason.trim() || input.reason.trim().length > 1000)
    throw new FinanceError("INVALID_JOURNAL", "Enter a release reason.")
  const source = await reviewAllocationReleaseSource(
    tx,
    input,
    book,
    account,
    amount,
  )
  const totals = await getCustomerLedgerTotalsInTransaction(
    tx,
    account.id,
    account.lastSequence,
  )
  return {
    bookId: book.id,
    accountId: account.id,
    customerId: account.customerId,
    customerName: account.customer.name,
    currencyCode: book.currencyCode,
    accountRevision: account.revision.toString(),
    amountMinor: amount.toString(),
    allocationId: source.allocation.id,
    creditEntryId: source.allocation.creditEntryId,
    chargeEntryId: source.allocation.chargeEntryId,
    allocatedBeforeMinor: source.remaining.toString(),
    allocatedAfterMinor: (source.remaining - amount).toString(),
    accountCreditBeforeMinor: totals.availableCreditMinor,
    accountCreditAfterMinor: (
      BigInt(totals.availableCreditMinor) + amount
    ).toString(),
    accountDebtBeforeMinor: totals.outstandingDebtMinor,
    accountDebtAfterMinor: (
      BigInt(totals.outstandingDebtMinor) + amount
    ).toString(),
    orderId: source.order?.id ?? null,
    orderNumber: source.order?.orderNumber ?? null,
    effect: "RELEASE_EXISTING_ALLOCATION" as const,
    monetaryRefund: "NOT_PERFORMED" as const,
  }
}
