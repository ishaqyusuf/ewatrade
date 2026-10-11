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
import type { ApplyCustomerLedgerCreditInput } from "./allocations"

type SourceInput = Omit<
  ApplyCustomerLedgerCreditInput,
  "clientCommandId" | "expectedRevision"
>
async function source(
  tx: Prisma.TransactionClient,
  input: SourceInput,
  book: FinanceBook,
  account: CustomerLedgerAccount,
  amount: bigint,
  resolveOrder: typeof readPostedCustomerOrderCharge,
) {
  const [credit, charge] = await Promise.all([
    tx.customerLedgerEntry.findFirst({
      where: {
        id: input.creditEntryId,
        accountId: account.id,
        side: "CREDIT",
        kind: { in: ["OPENING_CREDIT", "RECEIPT"] },
        reversals: { none: {} },
      },
    }),
    tx.customerLedgerEntry.findFirst({
      where: {
        id: input.chargeEntryId,
        accountId: account.id,
        side: "DEBIT",
        kind: { in: ["OPENING_DEBT", "ORDER_CHARGE"] },
        reversals: { none: {} },
      },
    }),
  ])
  if (!credit || !charge)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose available held credit and a posted debt in this customer account.",
    )
  const order =
    charge.kind === "ORDER_CHARGE"
      ? await resolveOrder(tx, { book, account, charge })
      : null
  if (
    order &&
    ["DRAFT", "PENDING", "CANCELLED", "REFUNDED"].includes(order.status)
  )
    throw new FinanceError(
      "CONFLICT",
      "Credit can only settle an active confirmed Order.",
    )
  const used = async (side: "creditEntryId" | "chargeEntryId", id: string) => {
    const [allocated, released] = await Promise.all([
      tx.customerLedgerAllocation.aggregate({
        where: { accountId: account.id, [side]: id },
        _sum: { amountMinor: true },
      }),
      tx.customerLedgerAllocationRelease.aggregate({
        where: { allocation: { accountId: account.id, [side]: id } },
        _sum: { amountMinor: true },
      }),
    ])
    return (
      (allocated._sum.amountMinor ?? BigInt(0)) -
      (released._sum.amountMinor ?? BigInt(0))
    )
  }
  const [creditUsed, chargePaid] = await Promise.all([
    used("creditEntryId", credit.id),
    used("chargeEntryId", charge.id),
  ])
  if (
    creditUsed < BigInt(0) ||
    chargePaid < BigInt(0) ||
    amount > credit.amountMinor - creditUsed ||
    amount > charge.amountMinor - chargePaid
  )
    throw new FinanceError(
      "CONFLICT",
      "The allocation exceeds available credit or remaining debt.",
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
    credit,
    charge,
    order,
    advance,
    receivable,
    creditRemaining: credit.amountMinor - creditUsed,
    debtRemaining: charge.amountMinor - chargePaid,
  }
}
export function reviewCreditAllocationSource(
  tx: Prisma.TransactionClient,
  input: SourceInput,
  book: FinanceBook,
  account: CustomerLedgerAccount,
  amount: bigint,
) {
  return source(tx, input, book, account, amount, readPostedCustomerOrderCharge)
}
export function reviewLockedCreditAllocationSource(
  tx: Prisma.TransactionClient,
  input: SourceInput,
  book: FinanceBook,
  account: CustomerLedgerAccount,
  amount: bigint,
) {
  return source(tx, input, book, account, amount, lockPostedCustomerOrderCharge)
}
