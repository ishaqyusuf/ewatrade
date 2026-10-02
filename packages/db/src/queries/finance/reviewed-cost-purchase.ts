import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { financePostingCommandId } from "./commands"
import {
  type ReviewedCostBookContext,
  readReviewedCostBook,
} from "./reviewed-cost-book-context"
import type { ReviewedPurchaseSourceFacts } from "./reviewed-cost-purchase-facts"
import {
  auditReviewedCostPurchaseSource,
  auditReviewedCostRecognizedPurchaseSource,
} from "./reviewed-cost-purchase-rules"
import {
  loadReviewedCostPurchaseRecognitions,
  reviewedCostPurchaseRecognitionFacts,
} from "./reviewed-cost-recognition"
import { FinanceError } from "./rules"
import { normalizeQuantity } from "./valuation-math"

const receiptSelect = {
  id: true,
  tenantId: true,
  bookId: true,
  billLineId: true,
  stockOperationId: true,
  stockMovementId: true,
} satisfies Prisma.FinancePurchaseReceiptLineSelect
const receiptInclude = {
  billLine: {
    include: {
      bill: {
        include: {
          supplier: { select: { bookId: true } },
          store: { select: { tenantId: true, currencyCode: true } },
          lines: {
            take: 11,
            orderBy: { position: "asc" as const },
            include: {
              account: true,
              purchaseReceipt: { select: receiptSelect },
            },
          },
          supplierEntries: {
            where: { kind: "PURCHASE_BILL" as const },
            take: 2,
            include: {
              _count: { select: { reversals: true } },
              journalEntry: {
                include: {
                  lines: { take: 3, include: { account: true } },
                  reversal: { select: { id: true } },
                },
              },
            },
          },
          _count: {
            select: {
              lines: true,
              supplierEntries: { where: { kind: "PURCHASE_BILL" as const } },
            },
          },
        },
      },
    },
  },
  stockMovement: {
    include: {
      balanceSource: { include: { store: { select: { currencyCode: true } } } },
      operation: {
        include: {
          committedReservation: { select: { id: true } },
          _count: {
            select: {
              movements: true,
              purchaseReceipts: true,
              productFulfillments: true,
              productReturns: true,
              finalizedCounts: true,
              finalizedCloseouts: true,
              dispatchedTransfers: true,
              receivedTransfers: true,
              cancelledTransfers: true,
              corrections: true,
            },
          },
        },
      },
    },
  },
  valuationEvent: { include: { pool: true } },
} satisfies Prisma.FinancePurchaseReceiptLineInclude

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}
function jsonString(value: Prisma.JsonValue, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const field = value[key]
  return typeof field === "string" ? field : null
}

/** Private original purchase proof under Book coordination; no writes or stock locks. */
export async function resolveReviewedCostPurchaseSourceInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string; receiptId: string; through: Date },
  context?: ReviewedCostBookContext,
) {
  const sources = await resolveReviewedCostPurchaseSourcesInTransaction(
    tx,
    {
      ...input,
      receiptIds: [input.receiptId],
    },
    context,
  )
  const proof = sources.get(input.receiptId)
  if (!proof) conflict("Complete purchase source proof is missing.")
  return proof
}

/** Complete bounded purchase sources, loaded once for the original graph. */
export async function resolveReviewedCostPurchaseSourcesInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string; receiptIds: string[]; through: Date },
  context?: ReviewedCostBookContext,
) {
  const ids = new Set(input.receiptIds)
  if (
    !ids.size ||
    ids.size > 4096 ||
    ids.size !== input.receiptIds.length ||
    input.receiptIds.some((id) => !id.trim() || id.length > 256) ||
    !Number.isFinite(input.through.getTime()) ||
    input.through > new Date()
  )
    conflict(
      "Purchase review requires complete bounded receipts and finite past history-through time.",
    )
  const book = await readReviewedCostBook(tx, input, context)
  const receipts = await tx.financePurchaseReceiptLine.findMany({
    where: { id: { in: input.receiptIds } },
    include: receiptInclude,
    orderBy: { id: "asc" },
    take: ids.size + 1,
  })
  if (
    receipts.length !== ids.size ||
    new Set(receipts.map((row) => row.id)).size !== ids.size ||
    receipts.some((row) => !ids.has(row.id))
  )
    throw new FinanceError("NOT_FOUND", "Original purchase receipt not found.")
  for (const receipt of receipts) {
    if (
      receipt.tenantId !== input.tenantId ||
      receipt.bookId !== book.id ||
      receipt.billLine.bill.bookId !== book.id
    )
      conflict("Original purchase receipt belongs to another Tenant/Book.")
  }
  const recognitionIds = [
    ...new Set(
      receipts
        .filter((row) => row.billLine.bill.kind === "PURCHASE_ACCRUAL")
        .map((row) => row.billLine.bill.id),
    ),
  ]
  const documents = await loadReviewedCostPurchaseRecognitions(tx, {
    tenantId: input.tenantId,
    bookId: book.id,
    currencyCode: book.currencyCode,
    costBillIds: recognitionIds,
  })
  const requests = new Map<string, { kind: string; id: string }>()
  const key = (kind: string, id: string) => JSON.stringify([kind, id])
  for (const receipt of receipts) {
    const bill = receipt.billLine.bill
    const document = documents.get(bill.id)
    if (document) {
      const stage = document.events.find(
        (row) => row.originalStage === "RECEIPT",
      )
      if (!stage) conflict("Original receipt recognition is missing.")
      requests.set(key("REGISTER_PURCHASE", document.id), {
        kind: "REGISTER_PURCHASE",
        id: document.id,
      })
      requests.set(key("RECOGNIZE_PURCHASE", stage.id), {
        kind: "RECOGNIZE_PURCHASE",
        id: stage.id,
      })
    } else
      requests.set(key("RECORD_PURCHASE", bill.id), {
        kind: "RECORD_PURCHASE",
        id: bill.id,
      })
  }
  const commands = await tx.financeCommand.findMany({
    where: {
      bookId: book.id,
      OR: [...requests.values()].map(({ kind, id }) => ({
        kind,
        result: { path: ["id"], equals: id },
      })),
    },
    take: requests.size * 2 + 1,
  })
  const byResult = new Map<string, typeof commands>()
  for (const command of commands) {
    const id = jsonString(command.result, "id")
    if (!id || !requests.has(key(command.kind, id)))
      conflict("Purchase command scope changed.")
    const group = byResult.get(key(command.kind, id)) ?? []
    group.push(command)
    byResult.set(key(command.kind, id), group)
  }
  const original = (kind: string, id: string) => {
    const group = byResult.get(key(kind, id))
    const command = group?.[0]
    if (group?.length !== 1 || !command)
      conflict(
        "Purchase receipt has missing or duplicate original document commands.",
      )
    return command
  }
  const sources = receipts.map((receipt) => {
    const document = documents.get(receipt.billLine.bill.id)
    const stage = document?.events.find(
      (row) => row.originalStage === "RECEIPT",
    )
    const command = stage
      ? original("RECOGNIZE_PURCHASE", stage.id)
      : original("RECORD_PURCHASE", receipt.billLine.bill.id)
    return {
      receipt,
      document,
      stage,
      command,
      journalClientId: financePostingCommandId(
        command.clientCommandId,
        document ? "recognition-journal" : "purchase-journal",
      ),
    }
  })
  const journalClientIds = [
    ...new Set(sources.map((row) => row.journalClientId)),
  ]
  const postingCommands = await tx.financeCommand.findMany({
    where: { bookId: book.id, clientCommandId: { in: journalClientIds } },
    take: journalClientIds.length + 1,
  })
  if (
    new Set(postingCommands.map((row) => row.clientCommandId)).size !==
    postingCommands.length
  )
    conflict("Duplicate purchase journal commands.")
  const postingByClient = new Map(
    postingCommands.map((row) => [row.clientCommandId, row]),
  )
  const journalIds = [
    ...new Set(
      sources.flatMap((row) => (row.stage ? [row.stage.journalEntryId] : [])),
    ),
  ]
  const journals = journalIds.length
    ? await tx.financeJournalEntry.findMany({
        where: { id: { in: journalIds }, bookId: book.id },
        include: {
          lines: { take: 3, include: { account: true } },
          reversal: { select: { id: true } },
        },
        take: journalIds.length + 1,
      })
    : []
  const byJournal = new Map(journals.map((row) => [row.id, row]))
  return new Map(
    sources.map(({ receipt, document, stage, command, journalClientId }) => {
      const bill = receipt.billLine.bill
      const postingCommand = postingByClient.get(journalClientId) ?? null
      const recognized =
        document && stage
          ? {
              journal: byJournal.get(stage.journalEntryId) ?? null,
              recognition: reviewedCostPurchaseRecognitionFacts(
                document,
                original("REGISTER_PURCHASE", document.id),
                {
                  enteredInventoryUnitId:
                    receipt.stockMovement.enteredInventoryUnitId,
                  configurationVersionId:
                    receipt.stockMovement.configurationVersionId,
                  enteredQuantity:
                    receipt.stockMovement.enteredQuantity.toFixed(),
                },
              ),
            }
          : null
      const movement = receipt.stockMovement
      const { balanceSource: balance, operation } = movement
      const entry = recognized ? null : (bill.supplierEntries[0] ?? null)
      const journal = recognized
        ? recognized.journal
        : (entry?.journalEntry ?? null)
      const event = receipt.valuationEvent
      const canonical = (value: Prisma.Decimal) =>
        normalizeQuantity(
          balance.kind === "PACKAGED_STOCK"
            ? multiplyExactDecimals(
                value.toFixed(),
                movement.unitFactorSnapshot.toFixed(),
                18,
              )
            : value.toFixed(),
        )
      const facts: ReviewedPurchaseSourceFacts = {
        book,
        through: input.through,
        receipt: {
          id: receipt.id,
          tenantId: receipt.tenantId,
          bookId: receipt.bookId,
          billLineId: receipt.billLineId,
          stockOperationId: receipt.stockOperationId,
          stockMovementId: receipt.stockMovementId,
        },
        bill: {
          id: bill.id,
          bookId: bill.bookId,
          kind: bill.kind,
          supplierId: bill.supplierId,
          supplierBookId: bill.supplier?.bookId ?? null,
          storeId: bill.storeId,
          storeTenantId: bill.store?.tenantId ?? null,
          currencyCode: bill.store?.currencyCode ?? null,
          actorUserId: bill.actorUserId,
          description: bill.description,
          incurredAt: bill.incurredAt,
          totalMinor: bill.totalMinor,
          corrected:
            bill.voidedAt !== null ||
            bill.voidEffectiveAt !== null ||
            bill.voidedById !== null ||
            bill.voidReason !== null,
          lineCount: bill._count.lines,
          originalEntryCount: bill._count.supplierEntries,
          lines: bill.lines.map((line) => ({
            id: line.id,
            bookId: line.bookId,
            billId: line.billId,
            position: line.position,
            amountMinor: line.amountMinor,
            account: line.account,
            receipt: line.purchaseReceipt,
          })),
        },
        operation: {
          id: operation.id,
          tenantId: operation.tenantId,
          storeId: operation.storeId,
          type: operation.type,
          source: operation.source,
          actorUserId: operation.actorUserId,
          effectiveAt: operation.effectiveAt,
          clientOperationId: operation.clientOperationId,
          payloadHash: operation.payloadHash,
          linkedOperationId: operation.linkedOperationId,
          correctionOfOperationId: operation.correctionOfOperationId,
          ownerCounts: {
            ...operation._count,
            committedReservation: operation.committedReservation ? 1 : 0,
          },
        },
        movement: {
          id: movement.id,
          operationId: movement.operationId,
          balanceSourceId: balance.id,
          balanceTenantId: balance.tenantId,
          balanceStoreId: balance.storeId,
          currencyCode: balance.store.currencyCode,
          effect: movement.signedCanonicalEffect.toFixed(),
          before: canonical(movement.previousOnHandQuantity),
          after: canonical(movement.resultingOnHandQuantity),
          reversalOfMovementId: movement.reversalOfMovementId,
        },
        event: event
          ? {
              id: event.id,
              tenantId: event.tenantId,
              bookId: event.bookId,
              poolId: event.poolId,
              poolTenantId: event.pool.tenantId,
              poolBookId: event.pool.bookId,
              poolBalanceSourceId: event.pool.balanceSourceId,
              balanceSourceId: event.balanceSourceId,
              stockOperationId: event.stockOperationId,
              stockMovementId: event.stockMovementId,
              purchaseReceiptId: event.purchaseReceiptId,
              productReturnCostId: event.productReturnCostId,
              sequence: event.sequence,
              kind: event.kind,
              sourceKind: event.sourceKind,
              sourceId: event.sourceId,
              sourceCostMinor: event.sourceCostMinor,
              valueBeforeMinor: event.valueBeforeMinor,
              valueDeltaMinor: event.valueDeltaMinor,
              valueAfterMinor: event.valueAfterMinor,
              unknownReason: event.unknownReason,
              actorUserId: event.actorUserId,
              effectiveAt: event.effectiveAt,
              effect: event.canonicalEffect.toFixed(),
              before: event.quantityBefore.toFixed(),
              after: event.quantityAfter.toFixed(),
            }
          : null,
        supplierEntry: entry
          ? { ...entry, reversalCount: entry._count.reversals }
          : null,
        journal: journal
          ? {
              ...journal,
              reversed: journal.reversal !== null,
              lines: journal.lines.map((line) => ({
                ...line,
                account: line.account,
              })),
            }
          : null,
        command: { ...command, resultId: jsonString(command.result, "id") },
        postingCommand: postingCommand
          ? {
              ...postingCommand,
              entryId: jsonString(postingCommand.result, "entryId"),
            }
          : null,
      }
      const proof = recognized
        ? auditReviewedCostRecognizedPurchaseSource(
            facts,
            recognized.recognition,
          )
        : auditReviewedCostPurchaseSource(facts)
      return [receipt.id, proof] as const
    }),
  )
}
