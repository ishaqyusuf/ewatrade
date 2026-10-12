import type { StockCategorySelector } from "@ewatrade/utils/inventory-categories"
import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { lockFinanceBook, type FinanceActor } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import { purchaseJournalEntryId } from "./purchase-source"
import { FinanceError } from "./rules"
import { normalizeFinancePurchase } from "./purchase-recording-input"
import {
  resolveFinancePurchaseRecordingSource,
  composeFinancePurchaseRecordingReview,
  financePurchaseRecordingReviewDigest,
  prepareFinancePurchaseRecordingStock,
} from "./purchase-recording-review"
import { recordDirectPurchaseReceiptValuationsInTransaction } from "./valuation-receipts"

export type FinancePurchaseLineInput = {
  balanceSourceId: string
  description: string
  amountMinor: string
  enteredQuantity: string
  enteredInventoryUnitId: string
  expectedBalanceRevision: number
  expectedConfigurationVersionId: string
  categories: StockCategorySelector[]
}

export type FinancePurchaseInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  supplierId: string
  storeId: string
  description: string
  reference?: string
  incurredAt: Date
  dueAt?: Date
  lines: FinancePurchaseLineInput[]
}

/** Capture only supported fields; dates and categories cannot change after preparation. */
function snapshotPurchase(
  input: Omit<FinancePurchaseInput, "clientCommandId">,
) {
  return {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    bookId: input.bookId,
    supplierId: input.supplierId,
    storeId: input.storeId,
    description: input.description,
    reference: input.reference,
    incurredAt: new Date(input.incurredAt),
    dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
    lines: input.lines.map((l) => ({
      balanceSourceId: l.balanceSourceId,
      description: l.description,
      amountMinor: l.amountMinor,
      enteredQuantity: l.enteredQuantity,
      enteredInventoryUnitId: l.enteredInventoryUnitId,
      expectedBalanceRevision: l.expectedBalanceRevision,
      expectedConfigurationVersionId: l.expectedConfigurationVersionId,
      categories: l.categories.map((c) => ({ ...c })),
    })),
  }
}
async function executePurchase(
  tx: Prisma.TransactionClient,
  input: FinancePurchaseInput,
  preparedSource?: Awaited<
    ReturnType<typeof resolveFinancePurchaseRecordingSource>
  >,
  preparedStock?: Awaited<
    ReturnType<typeof prepareFinancePurchaseRecordingStock>
  >,
) {
  const normalized = normalizeFinancePurchase(input)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  const commandPayload = {
    ...payload,
    description: input.description.trim(),
    reference: input.reference?.trim() || null,
    lines: normalized.lines.map(({ amount, ...line }) => ({
      ...line,
      amountMinor: amount.toString(),
    })),
  }
  return financeDocumentCommand(
    tx,
    input,
    "RECORD_PURCHASE",
    commandPayload,
    async (book) => {
      const source =
        preparedSource ??
        (await resolveFinancePurchaseRecordingSource(tx, input, book))
      const stock =
        preparedStock ?? (await prepareFinancePurchaseRecordingStock(tx, input))
      for (const line of source.lines) {
        const preview = stock.sources.get(line.balanceSourceId)?.preview
        if (
          !preview ||
          preview.revision !== line.expectedBalanceRevision ||
          preview.configurationVersionId !==
            line.expectedConfigurationVersionId ||
          preview.currencyCode !== book.currencyCode
        )
          throw new FinanceError(
            "CONFLICT",
            "Refresh the purchase stock configuration and revision.",
          )
      }
      const bill = await tx.financeBill.create({
        data: {
          bookId: book.id,
          supplierId: source.supplier.id,
          kind: "PURCHASE",
          payeeName: source.supplier.name,
          description: input.description.trim(),
          reference: input.reference?.trim() || null,
          incurredAt: input.incurredAt,
          dueAt: input.dueAt,
          storeId: source.store.id,
          totalMinor: source.totalMinor,
          actorUserId: input.actorUserId,
        },
      })
      const billLines = source.lines.map((line) => ({
        id: randomUUID(),
        bookId: book.id,
        billId: bill.id,
        accountId: source.inventory.id,
        position: line.position,
        description: line.description,
        amountMinor: line.amount,
      }))
      await tx.financeBillLine.createMany({ data: billLines })
      const commands = source.lines.map((line) => ({
        actorUserId: input.actorUserId,
        balanceSourceId: line.balanceSourceId,
        clientOperationId: financePostingCommandId(
          input.clientCommandId,
          `purchase-stock:${book.id}:${line.position}`,
        ),
        direction: "increase" as const,
        effectiveAt: input.incurredAt,
        enteredInventoryUnitId: line.enteredInventoryUnitId,
        enteredQuantity: line.enteredQuantity,
        expectedBalanceRevision: line.expectedBalanceRevision,
        expectedConfigurationVersionId: line.expectedConfigurationVersionId,
        categories: line.categories,
        reason: line.description,
        schemaVersion: 1 as const,
        source: "finance_purchase" as const,
        storeId: source.store.id,
        tenantId: input.tenantId,
        type: "receipt" as const,
      }))
      const operations = await stock.execute(commands)
      const receipts = source.lines.map((line, index) => {
        const operation = operations.get(line.balanceSourceId),
          movement = operation?.movements[0]
        if (!operation || operation.movements.length !== 1 || !movement)
          throw new FinanceError(
            "CONFLICT",
            "The purchase receipt did not produce one movement.",
          )
        return {
          id: randomUUID(),
          tenantId: input.tenantId,
          bookId: book.id,
          billLineId: billLines[index]!.id,
          stockOperationId: operation.id,
          stockMovementId: movement.id,
        }
      })
      await tx.financePurchaseReceiptLine.createMany({ data: receipts })
      await recordDirectPurchaseReceiptValuationsInTransaction(tx, {
        tenantId: input.tenantId,
        bookId: book.id,
        billId: bill.id,
        actorUserId: input.actorUserId,
        receipts: receipts.map((r, index) => ({
          receiptId: r.id,
          expectedStockRevision:
            source.lines[index]!.expectedBalanceRevision + 1,
        })),
      })
      const journal = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "purchase-journal",
        ),
        sourceKind: "PURCHASE_BILL",
        sourceId: bill.id,
        description: input.description.trim(),
        effectiveAt: input.incurredAt,
        storeId: source.store.id,
        lines: [
          {
            accountId: source.inventory.id,
            side: "DEBIT",
            amountMinor: source.totalMinor.toString(),
          },
          {
            accountId: source.payable.id,
            side: "CREDIT",
            amountMinor: source.totalMinor.toString(),
          },
        ],
      })
      await tx.financeSupplierEntry.create({
        data: {
          bookId: book.id,
          supplierId: source.supplier.id,
          kind: "PURCHASE_BILL",
          side: "CREDIT",
          amountMinor: source.totalMinor,
          journalEntryId: purchaseJournalEntryId(journal),
          effectiveAt: input.incurredAt,
          actorUserId: input.actorUserId,
          description: input.description.trim(),
          billId: bill.id,
        },
      })
      return { id: bill.id }
    },
  )
}
export async function recordFinancePurchaseInTransaction(
  tx: Prisma.TransactionClient,
  input: FinancePurchaseInput,
) {
  normalizeFinancePurchase(input)
  return executePurchase(tx, {
    ...snapshotPurchase(input),
    clientCommandId: input.clientCommandId,
  })
}
/** Whole review is freshly rebuilt under Book/stock locks; source proof never leaves this closure. */
export async function prepareReviewedFinancePurchaseRecordingInTransaction(
  tx: Prisma.TransactionClient,
  input: Omit<FinancePurchaseInput, "clientCommandId">,
  expectedReviewDigest: string,
) {
  if (!/^[a-f0-9]{64}$/.test(expectedReviewDigest))
    throw new FinanceError("CONFLICT", "Refresh the received purchase review.")
  normalizeFinancePurchase({ ...input, clientCommandId: "review" })
  const owned = snapshotPurchase(input),
    book = await lockFinanceBook(tx, owned)
  const source = await resolveFinancePurchaseRecordingSource(tx, owned, book),
    stock = await prepareFinancePurchaseRecordingStock(tx, owned)
  const review = await composeFinancePurchaseRecordingReview(
    tx,
    owned,
    book,
    source,
    new Map([...stock.sources].map(([id, s]) => [id, s.preview])),
  )
  if (financePurchaseRecordingReviewDigest(review) !== expectedReviewDigest)
    throw new FinanceError(
      "CONFLICT",
      "Purchase, stock or valuation changed. Review again.",
    )
  let commandId: string | undefined,
    execution: ReturnType<typeof executePurchase> | undefined
  return {
    review,
    execute: (clientCommandId: string) => {
      if (commandId !== undefined && commandId !== clientCommandId)
        throw new FinanceError(
          "CONFLICT",
          "Prepared received purchase is bound to one command.",
        )
      commandId = clientCommandId
      return (execution ??= executePurchase(
        tx,
        { ...owned, clientCommandId },
        source,
        stock,
      ))
    },
  }
}

export async function recordFinancePurchase(
  db: PrismaClient,
  input: FinancePurchaseInput,
) {
  return db.$transaction(
    (tx) => recordFinancePurchaseInTransaction(tx, input),
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  )
}
