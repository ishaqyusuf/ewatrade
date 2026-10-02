import { randomUUID } from "node:crypto"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import {
  type StockCategorySelector,
  normalizeStockCategorySelectors,
} from "@ewatrade/utils/inventory-categories"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { FinancePurchaseRecognitionStage } from "../../../generated/prisma/enums"
import { postSingleBalanceStockOperationInTransaction } from "../inventory-operations"
import type { FinanceActor } from "./access"
import { assertFinanceManager } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import { purchaseRecognitionCategories } from "./purchase-recognition-receipt-source"
import {
  purchaseRecognitionPosting,
  purchaseRecognitionText,
} from "./purchase-recognition-rules"
import {
  loadPurchaseRecognition,
  purchaseRecognitionControl,
  verifyPurchaseRecognitionEvent,
} from "./purchase-recognition-source"
import {
  getPurchaseControlAccount,
  purchaseJournalEntryId,
  requirePurchaseDate,
} from "./purchase-source"
import {
  FinanceError,
  MAX_FINANCE_AMOUNT,
  assertFinancePostingDate,
  financeAmount,
} from "./rules"
import { recordPurchaseReceiptValuationInTransaction } from "./valuation-receipts"

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
  const description = purchaseRecognitionText(
    input.description,
    "purchase description",
    400,
  )
  requirePurchaseDate(input.agreedAt)
  if (
    !Array.isArray(input.lines) ||
    input.lines.length < 1 ||
    input.lines.length > 10 ||
    new Set(input.lines.map((line) => line.balanceSourceId)).size !==
      input.lines.length
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Enter 1–10 distinct purchase goods lines.",
    )
  }
  const lines = input.lines.map((line, position) => {
    if (!Array.isArray(line.categories) || !line.categories.length)
      throw new FinanceError("INVALID_JOURNAL", "Select receipt categories.")
    try {
      return {
        ...line,
        position,
        description: purchaseRecognitionText(
          line.description,
          "line description",
          200,
        ),
        amount: financeAmount(line.amountMinor),
        enteredQuantity: parseExactDecimal(line.enteredQuantity, {
          allowZero: false,
          maxScale: 18,
        }),
        categories: normalizeStockCategorySelectors(line.categories),
      }
    } catch (error) {
      if (error instanceof FinanceError) throw error
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Check the exact purchase quantity and categories.",
      )
    }
  })
  const totalMinor = lines.reduce((sum, line) => sum + line.amount, BigInt(0))
  if (totalMinor > MAX_FINANCE_AMOUNT)
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Purchase total exceeds the transaction limit.",
    )
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
      const tenant = await assertFinanceManager(tx, input)
      assertFinancePostingDate({
        effectiveAt: input.agreedAt,
        startsAt: book.startsAt,
        closedThrough: book.closedThrough,
        now: new Date(),
      })
      if (tenant.currencyCode !== book.currencyCode)
        throw new FinanceError(
          "CONFLICT",
          "The financial book currency has changed.",
        )
      const [supplier, store] = await Promise.all([
        tx.financeSupplierAccount.findFirst({
          where: { id: input.supplierId, bookId: book.id },
        }),
        tx.store.findFirst({
          where: {
            id: input.storeId,
            tenantId: input.tenantId,
            currencyCode: book.currencyCode,
          },
          select: { id: true },
        }),
      ])
      if (!supplier || !store)
        throw new FinanceError(
          "NOT_FOUND",
          "Choose a same-book supplier and same-currency business Store.",
        )
      const inventory = await getPurchaseControlAccount(
        tx,
        book.id,
        "1300",
        "ASSET",
        "INVENTORY",
      )
      for (const line of lines) {
        const balance = await tx.stockBalanceSource.findFirst({
          where: {
            id: line.balanceSourceId,
            tenantId: input.tenantId,
            storeId: store.id,
          },
          include: { inventoryUnit: true, product: true },
        })
        const unit = await tx.inventoryUnit.findUnique({
          where: { id: line.enteredInventoryUnitId },
        })
        if (
          !balance ||
          !unit ||
          unit.configurationVersionId !== line.expectedConfigurationVersionId ||
          unit.configurationVersionId !==
            balance.product.currentUnitConfigurationVersionId ||
          balance.inventoryUnit.configurationVersionId !==
            unit.configurationVersionId ||
          (balance.kind === "PACKAGED_STOCK" &&
            unit.id !== balance.inventoryUnitId)
        )
          throw new FinanceError(
            "CONFLICT",
            "The purchase goods units or Store scope have changed.",
          )
        try {
          parseExactDecimal(line.enteredQuantity, {
            allowZero: false,
            maxScale: unit.transactionScale,
          })
        } catch {
          throw new FinanceError(
            "INVALID_JOURNAL",
            "The purchase quantity exceeds its unit precision.",
          )
        }
      }
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
  requirePurchaseDate(input.effectiveAt)
  const reference = purchaseRecognitionText(
    input.reference,
    "source reference",
    160,
  )
  const invoiceAmount =
    input.stage === "INVOICE"
      ? financeAmount(input.invoiceAmountMinor ?? "")
      : null
  if (
    !["INVOICE", "OWNERSHIP", "RECEIPT"].includes(input.stage) ||
    (input.stage !== "INVOICE" &&
      (input.dueAt !== undefined || input.invoiceAmountMinor !== undefined)) ||
    (input.stage !== "RECEIPT" && input.receipts !== undefined) ||
    (input.dueAt &&
      (!Number.isFinite(input.dueAt.getTime()) ||
        input.dueAt < input.effectiveAt))
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Check the purchase fact, due date and receipt details.",
    )
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "RECOGNIZE_PURCHASE",
    { ...payload, reference },
    async (book) => {
      assertFinancePostingDate({
        effectiveAt: input.effectiveAt,
        startsAt: book.startsAt,
        closedThrough: book.closedThrough,
        now: new Date(),
      })
      const document = await loadPurchaseRecognition(tx, input)
      if (
        invoiceAmount !== null &&
        invoiceAmount !== document.costBill.totalMinor
      )
        throw new FinanceError(
          "CONFLICT",
          "The invoice must match the immutable agreed goods costs; record cost differences through an explicit adjustment source.",
        )
      if (
        input.effectiveAt < document.agreedAt ||
        document.events.some((event) => event.effectiveAt > input.effectiveAt)
      )
        throw new FinanceError(
          "INVALID_JOURNAL",
          "A purchase fact cannot precede its agreement or latest recognition.",
        )
      if (document.events.some((event) => event.reversalOfId))
        throw new FinanceError(
          "CONFLICT",
          "A corrected recognition document cannot accept new purchase facts.",
        )
      for (const event of document.events) {
        await verifyPurchaseRecognitionEvent(tx, document, event)
        if (event.journalEntry.reversal || event.reversal)
          throw new FinanceError(
            "CONFLICT",
            "The purchase source was already corrected.",
          )
      }
      const invoiceEvent = document.events.find(
        (event) => event.stage === "INVOICE",
      )
      if (invoiceEvent?.invoiceBillId) {
        const latest = await tx.financeSupplierEntry.aggregate({
          where: { bookId: book.id, billId: invoiceEvent.invoiceBillId },
          _max: { effectiveAt: true },
        })
        if (
          latest._max.effectiveAt &&
          input.effectiveAt < latest._max.effectiveAt
        )
          throw new FinanceError(
            "INVALID_JOURNAL",
            "A purchase fact cannot precede its latest invoice settlement.",
          )
      }
      const posting = purchaseRecognitionPosting(
        input.stage,
        new Set(document.events.map((event) => event.stage)),
      )
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
          await recordPurchaseReceiptValuationInTransaction(tx, {
            tenantId: input.tenantId,
            bookId: book.id,
            receiptId: receipt.id,
            actorUserId: input.actorUserId,
            expectedStockRevision: confirmation.expectedBalanceRevision + 1,
          })
        }
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
