import { createHash } from "node:crypto"
import { composePurchaseRecognitionReview } from "./purchase-recognition-review"
import { composePurchaseReceiptReview } from "./purchase-receipt-review"
import {
  normalizePurchaseRecognition,
  resolvePurchaseRecognitionSource,
} from "./purchase-recognition-preparation"
import {
  normalizePurchaseRegistration,
  resolvePurchaseRegistrationSource,
} from "./purchase-registration-source"
import { randomUUID } from "node:crypto"
import type { StockCategorySelector } from "@ewatrade/utils/inventory-categories"
import type {
  FinanceBook,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma/client"
import type { FinancePurchaseRecognitionStage } from "../../../generated/prisma/enums"
import {
  postSingleBalanceStockOperationInTransaction,
  preparePurchaseStockReceiptsInTransaction,
  type SingleBalanceInput,
} from "../inventory-operations"
import type { FinanceActor } from "./access"
import {
  financeDocumentCommand,
  prepareFinanceDocumentCommand,
  financePostingCommandId,
} from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import {
  assertReceiptMovement,
  purchaseRecognitionCategories,
} from "./purchase-recognition-receipt-source"
import {
  verifyLoadedPurchaseRecognitionEvent,
  purchaseRecognitionControl,
} from "./purchase-recognition-source"
import { purchaseJournalEntryId } from "./purchase-source"
import { FinanceError } from "./rules"
import { recordRecognitionReceiptValuations } from "./valuation-receipts"

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
  const { description, lines, totalMinor } =
    normalizePurchaseRegistration(input)
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
      const { supplier, store, inventory } =
        await resolvePurchaseRegistrationSource(tx, input, book, lines)
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
  return recognizePurchase(tx, input)
}

export function purchaseReceiptReviewDigest(
  review: Awaited<ReturnType<typeof composePurchaseReceiptReview>>,
) {
  return createHash("sha256").update(JSON.stringify(review)).digest("hex")
}

/** Fresh full review is checked under Book/sorted stock locks before any financial or stock write. */
export async function recognizeReviewedFinancePurchaseReceiptInTransaction(
  tx: Prisma.TransactionClient,
  input: Omit<
    RecognizeFinancePurchaseInput,
    "stage" | "receipts" | "dueAt" | "invoiceAmountMinor"
  > & { expectedReviewDigest: string },
) {
  if (!/^[a-f0-9]{64}$/.test(input.expectedReviewDigest))
    throw new FinanceError("CONFLICT", "Refresh the physical receipt review.")
  const { expectedReviewDigest, ...command } = input
  return recognizePurchase(
    tx,
    { ...command, stage: "RECEIPT" },
    expectedReviewDigest,
  )
}

type ReviewedReceiptInput = Omit<
  RecognizeFinancePurchaseInput,
  "stage" | "receipts" | "dueAt" | "invoiceAmountMinor"
> & { expectedReviewDigest: string }

/** Review and command share one transaction-local source; no graph is accepted or retained across confirmations. */
export async function prepareReviewedFinancePurchaseReceiptInTransaction(
  tx: Prisma.TransactionClient,
  input: ReviewedReceiptInput,
) {
  if (!/^[a-f0-9]{64}$/.test(input.expectedReviewDigest))
    throw new FinanceError("CONFLICT", "Refresh the physical receipt review.")
  normalizePurchaseRecognition({ ...input, stage: "RECEIPT" })
  const command = {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    bookId: input.bookId,
    clientCommandId: input.clientCommandId,
    recognitionId: input.recognitionId,
    stage: "RECEIPT" as const,
    effectiveAt: new Date(input.effectiveAt),
    reference: input.reference,
  }
  const { reference, invoiceAmount } = normalizePurchaseRecognition(command)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = command
  const prepared = await prepareFinanceDocumentCommand(
    tx,
    command,
    "RECOGNIZE_REVIEWED_PURCHASE_RECEIPT",
    {
      ...payload,
      reference,
      expectedReviewDigest: input.expectedReviewDigest,
    },
  )
  if (prepared.replay) {
    const replay = prepared.replay
    return { review: null, execute: () => prepared.execute(async () => replay) }
  }
  const source = await resolvePurchaseRecognitionSource(
    tx,
    command,
    prepared.book,
    invoiceAmount,
  )
  const stock = await preparePurchaseStockReceiptsInTransaction(tx, {
    tenantId: command.tenantId,
    storeId: source.document.storeId,
    lines: source.document.lines.map((line) => ({
      balanceSourceId: line.balanceSourceId,
      enteredInventoryUnitId: line.enteredInventoryUnitId,
      enteredQuantity: line.enteredQuantity.toFixed(),
      expectedConfigurationVersionId: line.configurationVersionId,
    })),
  })
  const header = await composePurchaseRecognitionReview(
    tx,
    command,
    prepared.book,
    source,
  )
  const review = await composePurchaseReceiptReview(
    tx,
    command,
    header,
    async (_tx, input) => {
      const preparedStock = stock.sources.get(input.balanceSourceId)
      if (!preparedStock)
        throw new FinanceError(
          "CONFLICT",
          "Original receipt stock preparation is incomplete.",
        )
      return preparedStock.preview
    },
  )
  if (purchaseReceiptReviewDigest(review) !== input.expectedReviewDigest)
    throw new FinanceError(
      "CONFLICT",
      "Purchase receipt facts, stock or valuation changed. Review again.",
    )
  const receipts = review.receipts.map((receipt) => ({ ...receipt }))
  return {
    review,
    execute: () =>
      prepared.execute((book) =>
        postPurchaseRecognition(tx, command, book, source, receipts, stock),
      ),
  }
}

async function recognizePurchase(
  tx: Prisma.TransactionClient,
  input: RecognizeFinancePurchaseInput,
  expectedReviewDigest?: string,
) {
  if (expectedReviewDigest) {
    const {
      stage: _stage,
      receipts: _receipts,
      dueAt: _due,
      invoiceAmountMinor: _amount,
      ...command
    } = input
    return (
      await prepareReviewedFinancePurchaseReceiptInTransaction(tx, {
        ...command,
        expectedReviewDigest,
      })
    ).execute()
  }
  const { reference, invoiceAmount } = normalizePurchaseRecognition(input)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "RECOGNIZE_PURCHASE",
    { ...payload, reference },
    async (book) => {
      const source = await resolvePurchaseRecognitionSource(
        tx,
        input,
        book,
        invoiceAmount,
      )
      return postPurchaseRecognition(tx, input, book, source)
    },
  )
}

async function postPurchaseRecognition(
  tx: Prisma.TransactionClient,
  input: RecognizeFinancePurchaseInput,
  book: FinanceBook,
  source: Awaited<ReturnType<typeof resolvePurchaseRecognitionSource>>,
  receiptsInput = input.receipts,
  stock?: Awaited<ReturnType<typeof preparePurchaseStockReceiptsInTransaction>>,
) {
  const { document, posting } = source
  const { reference } = normalizePurchaseRecognition(input)
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
  const recordedEvent = await tx.financePurchaseRecognitionEvent.create({
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
    const receipts = receiptsInput
    if (
      !Array.isArray(receipts) ||
      receipts.length !== document.lines.length ||
      new Set(receipts.map((line) => line.lineId)).size !== receipts.length
    )
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Confirm every original goods line exactly once.",
      )
    const lines = [...document.lines].sort((a, b) =>
      a.balanceSourceId.localeCompare(b.balanceSourceId),
    )
    const commands: SingleBalanceInput[] = lines.map((line) => {
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
      return {
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        storeId: document.storeId,
        balanceSourceId: line.balanceSourceId,
        clientOperationId: financePostingCommandId(
          input.clientCommandId,
          `recognition-stock:${line.id}`,
        ),
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
      }
    })
    const operations = new Map<
      string,
      Awaited<ReturnType<typeof postSingleBalanceStockOperationInTransaction>>
    >()
    if (stock) {
      for (const [id, operation] of await stock.execute(commands))
        operations.set(id, operation)
    } else {
      for (const command of commands) {
        if (
          await tx.stockOperation.findUnique({
            where: {
              tenantId_clientOperationId: {
                tenantId: input.tenantId,
                clientOperationId: command.clientOperationId,
              },
            },
            select: { id: true },
          })
        )
          throw new FinanceError(
            "CONFLICT",
            "This receipt stock identity already exists outside its command.",
          )
        operations.set(
          command.balanceSourceId,
          await postSingleBalanceStockOperationInTransaction(tx, command),
        )
      }
    }
    const receiptRows = lines.map((line) => {
      const operation = operations.get(line.balanceSourceId)
      const movement = operation?.movements[0]
      if (!operation || !movement || operation.movements.length !== 1)
        throw new FinanceError(
          "CONFLICT",
          "The goods receipt did not produce one exact movement.",
        )
      return {
        id: randomUUID(),
        tenantId: input.tenantId,
        bookId: book.id,
        billLineId: line.costBillLineId,
        stockOperationId: operation.id,
        stockMovementId: movement.id,
      }
    })
    await tx.financePurchaseReceiptLine.createMany({ data: receiptRows })
    const valuations = receiptRows.map((receipt, index) => ({
      receiptId: receipt.id,
      expectedStockRevision: commands[index]!.expectedBalanceRevision + 1,
    }))
    await recordRecognitionReceiptValuations(
      tx,
      {
        tenantId: input.tenantId,
        bookId: book.id,
        actorUserId: input.actorUserId,
        receipts: valuations,
      },
      async (actualReceipts) => {
        const journalEntry = await tx.financeJournalEntry.findUniqueOrThrow({
          where: { id: journalEntryId },
          include: { lines: { take: 3 }, reversal: true },
        })
        const event = {
          ...recordedEvent,
          journalEntry,
          reversal: null,
          invoiceBill: null,
        }
        const datedDocument = {
          ...document,
          events: [...document.events, event],
        }
        verifyLoadedPurchaseRecognitionEvent(
          datedDocument,
          event,
          debit,
          credit,
        )
        if (journalEntry.reversal)
          throw new FinanceError(
            "CONFLICT",
            "The new receipt journal was already reversed.",
          )
        const dates = new Map<string, Date>()
        for (const receipt of actualReceipts) {
          if (receipt.billLine.bill.id !== document.costBillId)
            throw new FinanceError(
              "CONFLICT",
              "The receipt no longer belongs to its exact purchase.",
            )
          const line = document.lines.find(
            (l) => l.costBillLineId === receipt.billLine.id,
          )
          const fact = assertReceiptMovement(
            datedDocument,
            event,
            line,
            receipt.stockMovement,
            input.actorUserId,
          )
          dates.set(receipt.stockMovementId, fact.effectiveAt)
        }
        return dates
      },
    )
  }
  return { id: eventId }
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
