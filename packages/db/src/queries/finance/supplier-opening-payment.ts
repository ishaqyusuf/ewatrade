import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import { getPurchaseControlAccount } from "./purchase-source"
import { FinanceError, financeAmount } from "./rules"
import { normalizeFinanceSupplierDescription } from "./supplier-rules"

/**
 * Paying off a Supplier's starting balance (opening payable) from a money
 * account. Posts DEBIT payable / CREDIT money account and records an
 * OPENING_PAYMENT supplier entry against the Supplier's one opening payable.
 */
export const SUPPLIER_OPENING_PAYMENT_SOURCE = "SUPPLIER_OPENING_PAYMENT"

export type FinanceSupplierOpeningPaymentInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  supplierId: string
  moneyAccountId: string
  amountMinor: string
  description: string
  effectiveAt: Date
}

type OpeningBalanceRow = {
  entryId: string
  originalMinor: bigint
  paidMinor: bigint
  outstandingMinor: bigint
  effectiveAt: Date
  latestPaymentAt: Date | null
}

/** The Supplier's unreversed opening payable and what is still owed on it. */
export async function readSupplierOpeningBalance(
  tx: Prisma.TransactionClient,
  bookId: string,
  supplierId: string,
): Promise<OpeningBalanceRow | null> {
  const opening = await tx.financeSupplierEntry.findFirst({
    where: {
      bookId,
      supplierId,
      kind: "OPENING_PAYABLE",
      reversals: { none: {} },
    },
    select: { id: true, amountMinor: true, effectiveAt: true },
  })
  if (!opening) return null
  const payments = await tx.financeSupplierEntry.findMany({
    where: {
      bookId,
      supplierId,
      kind: "OPENING_PAYMENT",
      reversals: { none: {} },
    },
    select: { amountMinor: true, effectiveAt: true },
  })
  const paidMinor = payments.reduce(
    (sum, payment) => sum + payment.amountMinor,
    BigInt(0),
  )
  const latestPaymentAt = payments.reduce<Date | null>(
    (latest, payment) =>
      !latest || payment.effectiveAt > latest ? payment.effectiveAt : latest,
    null,
  )
  return {
    entryId: opening.id,
    originalMinor: opening.amountMinor,
    paidMinor,
    outstandingMinor: opening.amountMinor - paidMinor,
    effectiveAt: opening.effectiveAt,
    latestPaymentAt,
  }
}

/** Read for the dashboard: null when the Supplier has no starting balance owed. */
export async function getFinanceSupplierOpeningBalance(
  db: PrismaClient,
  input: FinanceActor & { bookId: string; supplierId: string },
) {
  return db.$transaction(async (tx) => {
    await assertFinanceManager(tx, input)
    const book = await tx.financeBook.findFirst({
      where: { id: input.bookId, tenantId: input.tenantId },
      select: { id: true },
    })
    if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
    const row = await readSupplierOpeningBalance(tx, book.id, input.supplierId)
    if (!row) return null
    return {
      entryId: row.entryId,
      originalMinor: row.originalMinor.toString(),
      paidMinor: row.paidMinor.toString(),
      outstandingMinor: row.outstandingMinor.toString(),
      effectiveAt: row.effectiveAt,
    }
  })
}

export async function payFinanceSupplierOpeningInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceSupplierOpeningPaymentInput,
) {
  const amount = financeAmount(input.amountMinor)
  const description = normalizeFinanceSupplierDescription(input.description)
  if (!Number.isFinite(input.effectiveAt.getTime()))
    throw new FinanceError("INVALID_JOURNAL", "Enter a valid payment date.")
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "PAY_SUPPLIER_OPENING",
    { ...payload, description },
    async (book) => {
      const supplier = await tx.financeSupplierAccount.findFirst({
        where: { id: input.supplierId, bookId: book.id },
        select: { id: true },
      })
      if (!supplier)
        throw new FinanceError(
          "NOT_FOUND",
          "Supplier not found in this financial book.",
        )
      const opening = await readSupplierOpeningBalance(tx, book.id, supplier.id)
      if (!opening || opening.outstandingMinor <= BigInt(0))
        throw new FinanceError(
          "CONFLICT",
          "This Supplier has no starting balance left to pay.",
        )
      if (amount > opening.outstandingMinor)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "That is more than the starting balance still owed.",
        )
      if (input.effectiveAt < opening.effectiveAt)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "A payment cannot be dated before the starting balance.",
        )
      const payable = await getPurchaseControlAccount(
        tx,
        book.id,
        "2000",
        "LIABILITY",
        "PAYABLE",
      )
      const money = await tx.financeAccount.findFirst({
        where: {
          id: input.moneyAccountId,
          bookId: book.id,
          kind: "ASSET",
          purpose: { in: ["CASH", "BANK", "CLEARING"] },
          archivedAt: null,
        },
        select: { id: true },
      })
      if (!money)
        throw new FinanceError(
          "NOT_FOUND",
          "Choose an active cash, bank, or clearing account.",
        )
      const supplierEntryId = randomUUID()
      const journalResult = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "supplier-opening-payment",
        ),
        sourceKind: SUPPLIER_OPENING_PAYMENT_SOURCE,
        sourceId: supplierEntryId,
        description,
        effectiveAt: input.effectiveAt,
        lines: [
          {
            accountId: payable.id,
            side: "DEBIT",
            amountMinor: amount.toString(),
          },
          {
            accountId: money.id,
            side: "CREDIT",
            amountMinor: amount.toString(),
          },
        ],
      })
      const entryId =
        journalResult &&
        typeof journalResult === "object" &&
        typeof (journalResult as { entryId?: unknown }).entryId === "string"
          ? (journalResult as { entryId: string }).entryId
          : null
      if (!entryId)
        throw new FinanceError(
          "CONFLICT",
          "The saved journal result cannot be recovered.",
        )
      const entry = await tx.financeSupplierEntry.create({
        data: {
          id: supplierEntryId,
          bookId: book.id,
          supplierId: supplier.id,
          kind: "OPENING_PAYMENT",
          side: "DEBIT",
          amountMinor: amount,
          journalEntryId: entryId,
          moneyAccountId: money.id,
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
          description,
        },
        select: { id: true },
      })
      return { id: entry.id }
    },
  )
}

export async function payFinanceSupplierOpening(
  db: PrismaClient,
  input: FinanceSupplierOpeningPaymentInput,
) {
  return db.$transaction(
    (tx) => payFinanceSupplierOpeningInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
