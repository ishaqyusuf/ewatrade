import type {
  CustomerLedgerAccount,
  FinanceBook,
  Prisma,
} from "../../../generated/prisma/client"
import { FinanceError } from "../finance/rules"
import type { ReleaseCustomerLedgerAllocationInput } from "./allocation-releases"
import { resolveCustomerAllocationAfterBilling } from "./billing-reclassification"
import { getUnbilledOrderFundsControl } from "./funds-order-control"
import {
  lockPostedCustomerOrderCharge,
  readPostedCustomerOrderCharge,
} from "./order-charges"
import { postingLinesMatch } from "./reversal-sources"

type SourceInput = Omit<
  ReleaseCustomerLedgerAllocationInput,
  "clientCommandId" | "expectedRevision" | "reason"
>
async function source(
  tx: Prisma.TransactionClient,
  input: SourceInput,
  book: FinanceBook,
  account: CustomerLedgerAccount,
  amount: bigint,
  resolveOrder: typeof readPostedCustomerOrderCharge,
) {
  let allocation = await tx.customerLedgerAllocation.findFirst({
    where: { id: input.allocationId, accountId: account.id },
    include: { charge: true, credit: true },
  })
  if (allocation?.charge.sourceKind === "CUSTOMER_UNBILLED_ORDER_CREDIT") {
    const currentAllocationId = await resolveCustomerAllocationAfterBilling(
      tx,
      {
        tenantId: book.tenantId,
        accountId: account.id,
        allocationId: input.allocationId,
      },
    )
    if (currentAllocationId !== allocation.id)
      allocation = await tx.customerLedgerAllocation.findFirst({
        where: { id: currentAllocationId, accountId: account.id },
        include: { charge: true, credit: true },
      })
  }
  if (!allocation)
    throw new FinanceError(
      "NOT_FOUND",
      "Allocation not found in this customer account.",
    )
  const unbilled =
    allocation.charge.kind === "ORDER_PAYMENT" &&
    allocation.charge.side === "DEBIT" &&
    allocation.charge.sourceKind === "CUSTOMER_UNBILLED_ORDER_CREDIT" &&
    allocation.charge.sourceId === allocation.id &&
    allocation.charge.amountMinor === allocation.amountMinor
  if (
    (!unbilled &&
      !["OPENING_DEBT", "ORDER_CHARGE"].includes(allocation.charge.kind)) ||
    !["OPENING_CREDIT", "RECEIPT"].includes(allocation.credit.kind)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Only held-credit allocations can be released through this command.",
    )
  if (unbilled && resolveOrder === lockPostedCustomerOrderCharge)
    await tx.$queryRaw`SELECT id FROM "CommercialOrder" WHERE id = ${allocation.charge.orderId} AND "tenantId" = ${book.tenantId} FOR UPDATE`
  const unbilledOrder = unbilled
    ? await tx.commercialOrder.findFirst({
        where: {
          id: allocation.charge.orderId ?? "",
          tenantId: book.tenantId,
          customerId: account.customerId,
          currencyCode: account.currencyCode,
        },
      })
    : null
  if (unbilled && !unbilledOrder)
    throw new FinanceError(
      "CONFLICT",
      "The original Order credit no longer matches this customer account.",
    )
  const order =
    unbilledOrder ??
    (allocation.charge.kind === "ORDER_CHARGE"
      ? await resolveOrder(tx, {
          book,
          account,
          charge: allocation.charge,
        })
      : null)
  const released = await tx.customerLedgerAllocationRelease.aggregate({
    where: { allocationId: allocation.id },
    _sum: { amountMinor: true },
  })
  if (
    amount >
    allocation.amountMinor - (released._sum.amountMinor ?? BigInt(0))
  )
    throw new FinanceError(
      "CONFLICT",
      "The release exceeds the remaining allocation.",
    )
  const [advance, receivable] = await Promise.all([
    tx.financeAccount.findFirst({
      where: {
        bookId: book.id,
        kind: "LIABILITY",
        purpose: "CUSTOMER_ADVANCE",
        archivedAt: null,
      },
    }),
    unbilled
      ? getUnbilledOrderFundsControl(tx, book.id)
      : tx.financeAccount.findFirst({
          where: {
            bookId: book.id,
            kind: "ASSET",
            purpose: "RECEIVABLE",
            archivedAt: null,
          },
        }),
  ])
  if (!advance || !receivable)
    throw new FinanceError(
      "NOT_FOUND",
      "Customer control accounts are unavailable.",
    )
  if (unbilled) {
    const posting = await tx.financeJournalEntry.findUnique({
      where: {
        bookId_sourceKind_sourceId: {
          bookId: book.id,
          sourceKind: "CUSTOMER_CREDIT_ALLOCATION",
          sourceId: allocation.id,
        },
      },
      include: {
        reversal: { select: { id: true } },
        lines: {
          include: {
            account: { select: { id: true, kind: true, purpose: true } },
          },
        },
      },
    })
    if (
      !posting ||
      posting.reversal ||
      posting.reversalOfId ||
      !postingLinesMatch(posting.lines, [
        {
          accountId: advance.id,
          kind: "LIABILITY",
          purpose: "CUSTOMER_ADVANCE",
          side: "DEBIT",
          amount: allocation.amountMinor,
        },
        {
          accountId: receivable.id,
          kind: "LIABILITY",
          purpose: "OTHER",
          side: "CREDIT",
          amount: allocation.amountMinor,
        },
      ])
    )
      throw new FinanceError(
        "CONFLICT",
        "Reconcile the original Order credit custody posting before restoring funds.",
      )
  }
  return {
    allocation,
    unbilled,
    order,
    advance,
    receivable,
    remaining: allocation.amountMinor - (released._sum.amountMinor ?? 0n),
  }
}
export function reviewAllocationReleaseSource(
  tx: Prisma.TransactionClient,
  input: SourceInput,
  book: FinanceBook,
  account: CustomerLedgerAccount,
  amount: bigint,
) {
  return source(tx, input, book, account, amount, readPostedCustomerOrderCharge)
}
export function reviewLockedAllocationReleaseSource(
  tx: Prisma.TransactionClient,
  input: SourceInput,
  book: FinanceBook,
  account: CustomerLedgerAccount,
  amount: bigint,
) {
  return source(tx, input, book, account, amount, lockPostedCustomerOrderCharge)
}
