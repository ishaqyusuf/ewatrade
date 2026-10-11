import type {
  Prisma,
  FinanceBook,
  CustomerLedgerAccount,
} from "../../../generated/prisma/client"
import { FinanceError } from "../finance/rules"
import {
  lockPostedCustomerOrderCharge,
  readPostedCustomerOrderCharge,
} from "./order-charges"
import type { ReleaseCustomerLedgerAllocationInput } from "./allocation-releases"

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
  const allocation = await tx.customerLedgerAllocation.findFirst({
    where: { id: input.allocationId, accountId: account.id },
    include: { charge: true, credit: true },
  })
  if (!allocation)
    throw new FinanceError(
      "NOT_FOUND",
      "Allocation not found in this customer account.",
    )
  if (
    !["OPENING_DEBT", "ORDER_CHARGE"].includes(allocation.charge.kind) ||
    !["OPENING_CREDIT", "RECEIPT"].includes(allocation.credit.kind)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Only held-credit allocations can be released through this command.",
    )
  const order =
    allocation.charge.kind === "ORDER_CHARGE"
      ? await resolveOrder(tx, {
          book,
          account,
          charge: allocation.charge,
        })
      : null
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
    tx.financeAccount.findFirst({
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
  return {
    allocation,
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
