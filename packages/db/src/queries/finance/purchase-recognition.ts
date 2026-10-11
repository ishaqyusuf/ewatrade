import { normalizePurchaseRecognition, resolvePurchaseRecognitionSource } from "./purchase-recognition-preparation"
import { normalizePurchaseRegistration, resolvePurchaseRegistrationSource } from "./purchase-registration-source"
import { randomUUID } from "node:crypto"
import type { StockCategorySelector } from "@ewatrade/utils/inventory-categories"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { FinancePurchaseRecognitionStage } from "../../../generated/prisma/enums"
import { postSingleBalanceStockOperationInTransaction } from "../inventory-operations"
import type { FinanceActor } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import { purchaseRecognitionCategories } from "./purchase-recognition-receipt-source"
import { purchaseRecognitionControl } from "./purchase-recognition-source"
import { purchaseJournalEntryId } from "./purchase-source"
import { FinanceError } from "./rules"
import { recordPurchaseReceiptValuationsInTransaction } from "./valuation-receipts"

export type RegisterFinancePurchaseInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  supplierId: string
  storeId: string
  description: string
  agreedAt: Date
  lines: Array<{
    balanceSourceId: string
    description: string
    amountMinor: string
    enteredQuantity: string
    enteredInventoryUnitId: string
    expectedConfigurationVersionId: string
    categories: StockCategorySelector[]
  }>
}

export type RecognizeFinancePurchaseInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  recognitionId: string
  stage: FinancePurchaseRecognitionStage
  effectiveAt: Date
  reference: string
  dueAt?: Date
  invoiceAmountMinor?: string
  receipts?: Array<{ lineId: string; expectedBalanceRevision: number }>
}

export async function registerFinancePurchaseInTransaction(
  tx: Prisma.TransactionClient,
  input: RegisterFinancePurchaseInput,
) {
  const { description, lines, totalMinor } = normalizePurchaseRegistration(input)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "REGISTER_PURCHASE",
    {
      ...payload,
      description,
      lines: lines.map(({ amount, ...line }) => ({
        ...line,
        amountMinor: amount.toString(),
      })),
    },
    async (book) => {
      const { supplier, store, inventory } = await resolvePurchaseRegistrationSource(tx, input, book, lines)
      const costBill = await tx.financeBill.create({
        data: {
          bookId: book.id,
          supplierId: supplier.id,
          kind: "PURCHASE_ACCRUAL",
          payeeName: supplier.name,
          description,
          incurredAt: input.agreedAt,
          storeId: store.id,
          totalMinor,
          actorUserId: input.actorUserId,
        },
      })
      const document = await tx.financePurchaseRecognition.create({
        data: {
          tenantId: input.tenantId,
          bookId: book.id,
          supplierId: supplier.id,
          storeId: store.id,
          costBillId: costBill.id,
          agreedAt: input.agreedAt,
          actorUserId: input.actorUserId,
        },
      })
      for (const line of lines) {
        const costLine = await tx.financeBillLine.create({
          data: {
            bookId: book.id,
            billId: costBill.id,
            accountId: inventory.id,
            position: line.position,
            description: line.description,
            amountMinor: line.amount,
          },
        })
        await tx.financePurchaseRecognitionLine.create({
          data: {
            tenantId: input.tenantId,
            bookId: book.id,
            recognitionId: document.id,
            costBillId: costBill.id,
            costBillLineId: costLine.id,
            balanceSourceId: line.balanceSourceId,
            enteredInventoryUnitId: line.enteredInventoryUnitId,
            configurationVersionId: line.expectedConfigurationVersionId,
            enteredQuantity: line.enteredQuantity,
            categories: line.categories,
          },
        })
      }
      return { id: document.id }
    },
  )
}

export async function recognizeFinancePurchaseInTransaction(
  tx: Prisma.TransactionClient,
  input: RecognizeFinancePurchaseInput,
) {
  const { reference, invoiceAmount } = normalizePurchaseRecognition(input)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "RECOGNIZE_PURCHASE",
    { ...payload, reference },
    async (book) => {
      const { document, posting } = await resolvePurchaseRecognitionSource(tx, input, book, invoiceAmount)
      const debit = await purchaseRecognitionControl(
        tx,
        book.id,
        posting.debit,
        true,
      )
      const credit = await purchaseRecognitionControl(
        tx,
        book.id,
        posting.credit,
        true,
      )
      const eventId = randomUUID()
      let invoiceBillId: string | undefined
      if (input.stage === "INVOICE") {
        const bill = await tx.financeBill.create({
          data: {
            bookId: book.id,
            supplierId: document.supplierId,
            kind: "PURCHASE",
            payeeName: document.costBill.payeeName,
            description: document.costBill.description,
            reference,
            incurredAt: input.effectiveAt,
            dueAt: input.dueAt,
            storeId: document.storeId,
            totalMinor: document.costBill.totalMinor,
            actorUserId: input.actorUserId,
          },
        })
        invoiceBillId = bill.id
        await tx.financeBillLine.createMany({
          data: document.costBill.lines.map((line) => ({
            bookId: book.id,
            billId: bill.id,
            accountId: debit.id,
            position: line.position,
            description: line.description,
            amountMinor: line.amountMinor,
          })),
        })
      }
      const journal = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "recognition-journal",
        ),
        sourceKind:
          input.stage === "INVOICE"
            ? "PURCHASE_BILL"
            : `PURCHASE_${input.stage}_RECOGNITION`,
        sourceId: invoiceBillId ?? eventId,
        description: document.costBill.description,
        storeId: document.storeId,
        lines: [
          {
            accountId: debit.id,
            side: "DEBIT",
            amountMinor: document.costBill.totalMinor.toString(),
          },
          {
            accountId: credit.id,
            side: "CREDIT",
            amountMinor: document.costBill.totalMinor.toString(),
          },
        ],
      })
      const journalEntryId = purchaseJournalEntryId(journal)
      await tx.financePurchaseRecognitionEvent.create({
        data: {
          id: eventId,
          bookId: book.id,
          supplierId: document.supplierId,
          recognitionId: document.id,
          stage: input.stage,
          originalStage: input.stage,
          journalEntryId,
          debitAccountId: debit.id,
          creditAccountId: credit.id,
          invoiceBillId,
          effectiveAt: input.effectiveAt,
          reference,
          actorUserId: input.actorUserId,
        },
      })
      if (invoiceBillId) {
        await tx.financeSupplierEntry.create({
          data: {
            bookId: book.id,
            supplierId: document.supplierId,
            kind: "PURCHASE_BILL",
            side: "CREDIT",
            amountMinor: document.costBill.totalMinor,
            journalEntryId,
            effectiveAt: input.effectiveAt,
            actorUserId: input.actorUserId,
            description: document.costBill.description,
            billId: invoiceBillId,
          },
        })
      }
      if (input.stage === "RECEIPT") {
        const receipts = input.receipts
        if (
          !Array.isArray(receipts) ||
          receipts.length !== document.lines.length ||
          new Set(receipts.map((line) => line.lineId)).size !== receipts.length
        )
          throw new FinanceError(
            "INVALID_JOURNAL",
            "Confirm every original goods line exactly once.",
          )
        const valuations: Array<{
          receiptId: string
          expectedStockRevision: number
        }> = []
        for (const line of [...document.lines].sort((a, b) =>
          a.balanceSourceId.localeCompare(b.balanceSourceId),
        )) {
          const confirmation = receipts.find(
            (receipt) => receipt.lineId === line.id,
          )
          if (
            !confirmation ||
            !Number.isInteger(confirmation.expectedBalanceRevision) ||
            confirmation.expectedBalanceRevision < 0 ||
            confirmation.expectedBalanceRevision >= 2_147_483_647
          )
            throw new FinanceError(
              "INVALID_JOURNAL",
              "Refresh the receipt's stock revisions.",
            )
          const clientOperationId = financePostingCommandId(
            input.clientCommandId,
            `recognition-stock:${line.id}`,
          )
          if (
            await tx.stockOperation.findUnique({
              where: {
                tenantId_clientOperationId: {
                  tenantId: input.tenantId,
                  clientOperationId,
                },
              },
              select: { id: true },
            })
          )
            throw new FinanceError(
              "CONFLICT",
              "This receipt stock identity already exists outside its command.",
            )
          const operation = await postSingleBalanceStockOperationInTransaction(
            tx,
            {
              actorUserId: input.actorUserId,
              tenantId: input.tenantId,
              storeId: document.storeId,
              balanceSourceId: line.balanceSourceId,
              clientOperationId,
              direction: "increase",
              effectiveAt: input.effectiveAt,
              enteredInventoryUnitId: line.enteredInventoryUnitId,
              enteredQuantity: line.enteredQuantity.toFixed(),
              expectedBalanceRevision: confirmation.expectedBalanceRevision,
              expectedConfigurationVersionId: line.configurationVersionId,
              categories: purchaseRecognitionCategories(line.categories),
              reason: line.costBillLine.description,
              schemaVersion: 1,
              source: "finance_purchase",
              type: "receipt",
            },
          )
          const movement = operation.movements[0]
          if (!movement || operation.movements.length !== 1)
            throw new FinanceError(
              "CONFLICT",
              "The goods receipt did not produce one exact movement.",
            )
          const receipt = await tx.financePurchaseReceiptLine.create({
            data: {
              tenantId: input.tenantId,
              bookId: book.id,
              billLineId: line.costBillLineId,
              stockOperationId: operation.id,
              stockMovementId: movement.id,
            },
          })
          valuations.push({
            receiptId: receipt.id,
            expectedStockRevision: confirmation.expectedBalanceRevision + 1,
          })
        }
        await recordPurchaseReceiptValuationsInTransaction(tx, {
          tenantId: input.tenantId,
          bookId: book.id,
          actorUserId: input.actorUserId,
          receipts: valuations,
        })
      }
      return { id: eventId }
    },
  )
}

export async function registerFinancePurchase(
  db: PrismaClient,
  input: RegisterFinancePurchaseInput,
) {
  return db.$transaction(
    (tx) => registerFinancePurchaseInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export async function recognizeFinancePurchase(
  db: PrismaClient,
  input: RecognizeFinancePurchaseInput,
) {
  return db.$transaction(
    (tx) => recognizeFinancePurchaseInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
