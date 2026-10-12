import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import { assertFinanceManager, lockFinanceBook } from "./access"
import { getPurchaseControlAccount } from "./purchase-source"
import { FinanceError, financeAmount, assertFinancePostingDate } from "./rules"
import { normalizeFinanceSupplierDescription } from "./supplier-rules"
import type { FinanceSupplierOpeningInput } from "./supplier-writes"

export type FinanceSupplierOpeningReviewInput = Omit<
  FinanceSupplierOpeningInput,
  "clientCommandId" | "effectiveAt"
>
export function normalizeSupplierOpening(
  input: FinanceSupplierOpeningReviewInput,
) {
  const amount = financeAmount(input.amountMinor)
  const description = normalizeFinanceSupplierDescription(input.description)
  const kind =
    input.kind === "PAYABLE"
      ? ("OPENING_PAYABLE" as const)
      : input.kind === "ADVANCE"
        ? ("OPENING_ADVANCE" as const)
        : null
  if (!kind)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a payable or advance opening.",
    )
  return { amount, description, kind }
}
/** Shared canonical source proof; includes reversed openings in the one-per-kind rule. */
export async function reviewSupplierOpeningSource(
  tx: Prisma.TransactionClient,
  input: Omit<FinanceSupplierOpeningInput, "clientCommandId">,
  book: FinanceBook,
) {
  const normalized = normalizeSupplierOpening(input)
  if (
    !Number.isFinite(input.effectiveAt.getTime()) ||
    input.effectiveAt.getTime() !== book.startsAt.getTime()
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A supplier opening must use the bookkeeping start date.",
    )
  assertFinancePostingDate({
    effectiveAt: input.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  const supplier = await tx.financeSupplierAccount.findFirst({
    where: { id: input.supplierId, bookId: book.id },
    select: { id: true, bookId: true, name: true, code: true },
  })
  if (!supplier || supplier.bookId !== book.id)
    throw new FinanceError(
      "NOT_FOUND",
      "Supplier not found in this financial book.",
    )
  const prior = await tx.financeSupplierEntry.findFirst({
    where: { bookId: book.id, supplierId: supplier.id, kind: normalized.kind },
    select: { id: true },
  })
  if (prior)
    throw new FinanceError(
      "CONFLICT",
      "This supplier already has an opening of that kind.",
    )
  const control =
    normalized.kind === "OPENING_PAYABLE"
      ? await getPurchaseControlAccount(
          tx,
          book.id,
          "2000",
          "LIABILITY",
          "PAYABLE",
        )
      : await getPurchaseControlAccount(
          tx,
          book.id,
          "1250",
          "ASSET",
          "SUPPLIER_ADVANCE",
        )
  const equity = await getPurchaseControlAccount(
    tx,
    book.id,
    "3900",
    "EQUITY",
    "OPENING_EQUITY",
  )
  if (control.bookId !== book.id || equity.bookId !== book.id)
    throw new FinanceError(
      "CONFLICT",
      "Opening controls must belong to the financial book.",
    )
  const lines =
    normalized.kind === "OPENING_PAYABLE"
      ? [
          {
            accountId: equity.id,
            side: "DEBIT" as const,
            amountMinor: normalized.amount.toString(),
          },
          {
            accountId: control.id,
            side: "CREDIT" as const,
            amountMinor: normalized.amount.toString(),
          },
        ]
      : [
          {
            accountId: control.id,
            side: "DEBIT" as const,
            amountMinor: normalized.amount.toString(),
          },
          {
            accountId: equity.id,
            side: "CREDIT" as const,
            amountMinor: normalized.amount.toString(),
          },
        ]
  return { ...normalized, supplier, control, equity, lines }
}
export async function loadSupplierOpeningReview(
  tx: Prisma.TransactionClient,
  input: FinanceSupplierOpeningReviewInput,
  locked = false,
) {
  normalizeSupplierOpening(input)
  let book: FinanceBook
  if (locked) book = await lockFinanceBook(tx, input)
  else {
    await assertFinanceManager(tx, input)
    const found = await tx.financeBook.findFirst({
      where: { id: input.bookId, tenantId: input.tenantId },
    })
    if (!found) throw new FinanceError("NOT_FOUND", "Financial book not found.")
    book = found
  }
  const owned = { ...input, effectiveAt: new Date(book.startsAt) }
  const source = await reviewSupplierOpeningSource(tx, owned, book)
  const accounts = [source.control, source.equity]
  return {
    input: owned,
    source,
    review: {
      bookId: book.id,
      currencyCode: book.currencyCode,
      startsAt: book.startsAt.toISOString(),
      closedThrough: book.closedThrough?.toISOString() ?? null,
      supplierId: source.supplier.id,
      supplierName: source.supplier.name,
      supplierCode: source.supplier.code,
      kind: input.kind,
      entryKind: source.kind,
      amountMinor: source.amount.toString(),
      description: source.description,
      effectiveAt: book.startsAt.toISOString(),
      payableIncreaseMinor:
        input.kind === "PAYABLE" ? source.amount.toString() : "0",
      unallocatedAdvanceIncreaseMinor:
        input.kind === "ADVANCE" ? source.amount.toString() : "0",
      lines: source.lines
        .map((l) => {
          const account = accounts.find((a) => a.id === l.accountId)!
          return {
            accountId: account.id,
            accountName: account.name,
            code: account.code,
            kind: account.kind,
            purpose: account.purpose,
            debitMinor: l.side === "DEBIT" ? l.amountMinor : "0",
            creditMinor: l.side === "CREDIT" ? l.amountMinor : "0",
          }
        })
        .sort((a, b) => a.accountId.localeCompare(b.accountId)),
      stockEffect: "NONE" as const,
      moneyTransfer: "NOT_PERFORMED" as const,
      moneyAccountEffect: "NONE" as const,
      purchaseEffect: "NONE" as const,
    },
  }
}
export async function getFinanceSupplierOpeningReview(
  tx: Prisma.TransactionClient,
  input: FinanceSupplierOpeningReviewInput,
) {
  return (await loadSupplierOpeningReview(tx, input)).review
}
