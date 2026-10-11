import type { Prisma } from "../../../generated/prisma/client"
import { assertFinanceManager, lockFinanceBook } from "./access"
import { getPurchaseControlAccount } from "./purchase-source"
import { FinanceError, financeAmount, assertFinancePostingDate } from "./rules"
import { normalizeFinanceSupplierDescription } from "./supplier-rules"
import type { FinanceSupplierAdvanceInput } from "./supplier-writes"

export function normalizeSupplierAdvance(
  input: Omit<FinanceSupplierAdvanceInput, "clientCommandId">,
) {
  const amount = financeAmount(input.amountMinor)
  const description = normalizeFinanceSupplierDescription(input.description)
  if (!Number.isFinite(input.effectiveAt.getTime()))
    throw new FinanceError("INVALID_JOURNAL", "Enter a valid effective date.")
  return { amount, description }
}

/** Shared by advisory and canonical locked writing; never accepts a supplied source graph. */
export async function reviewSupplierAdvanceSource(
  tx: Prisma.TransactionClient,
  input: Omit<FinanceSupplierAdvanceInput, "clientCommandId">,
) {
  const supplier = await tx.financeSupplierAccount.findFirst({
    where: { id: input.supplierId, bookId: input.bookId },
    select: { id: true, code: true, name: true },
  })
  if (!supplier)
    throw new FinanceError(
      "NOT_FOUND",
      "Supplier not found in this financial book.",
    )
  const advance = await getPurchaseControlAccount(
    tx,
    input.bookId,
    "1250",
    "ASSET",
    "SUPPLIER_ADVANCE",
  )
  const money = await tx.financeAccount.findFirst({
    where: {
      id: input.moneyAccountId,
      bookId: input.bookId,
      kind: "ASSET",
      purpose: { in: ["CASH", "BANK", "CLEARING"] },
      archivedAt: null,
    },
  })
  if (!money)
    throw new FinanceError(
      "NOT_FOUND",
      "Choose an active cash, bank, or clearing account.",
    )
  return { supplier, advance, moneyAccount: money }
}

export async function getFinanceSupplierAdvanceReview(
  tx: Prisma.TransactionClient,
  input: Omit<FinanceSupplierAdvanceInput, "clientCommandId">,
  lockBook = false,
) {
  if (!lockBook) await assertFinanceManager(tx, input)
  const { amount, description } = normalizeSupplierAdvance(input)
  const book = lockBook
    ? await lockFinanceBook(tx, input)
    : await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
      })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  assertFinancePostingDate({
    effectiveAt: input.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  const { supplier, advance, moneyAccount } = await reviewSupplierAdvanceSource(
    tx,
    input,
  )
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    startsAt: book.startsAt.toISOString(),
    closedThrough: book.closedThrough?.toISOString() ?? null,
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierCode: supplier.code,
    moneyAccountId: moneyAccount.id,
    moneyAccountName: moneyAccount.name,
    moneyAccountPurpose: moneyAccount.purpose,
    advanceAccountId: advance.id,
    advanceAccountName: advance.name,
    amountMinor: amount.toString(),
    unallocatedAddedMinor: amount.toString(),
    description,
    effectiveAt: input.effectiveAt.toISOString(),
    effect: "RECORD_ALREADY_PAID_ADVANCE" as const,
    moneyTransfer: "NOT_PERFORMED" as const,
  }
}
