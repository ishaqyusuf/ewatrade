import { randomUUID } from "node:crypto"
import type {
  FinanceBook,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma/client"
import {
  assertFinanceManager,
  lockFinanceBook,
  type FinanceActor,
} from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import {
  assertPurchaseRecognitionReversal,
  purchaseRecognitionText,
} from "./purchase-recognition-rules"
import {
  loadPurchaseRecognition,
  verifyPurchaseRecognitionEvent,
} from "./purchase-recognition-source"
import { purchaseJournalEntryId, requirePurchaseDate } from "./purchase-source"
import { FinanceError, assertFinancePostingDate } from "./rules"

export type ReverseFinancePurchaseRecognitionInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  recognitionId: string
  eventId: string
  effectiveAt: Date
  reason: string
}

async function resolvePurchaseRecognitionReversalSource(
  tx: Prisma.TransactionClient,
  input: Omit<ReverseFinancePurchaseRecognitionInput, "clientCommandId">,
  book: FinanceBook,
) {
  assertFinancePostingDate({
    effectiveAt: input.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  const document = await loadPurchaseRecognition(tx, input)
  const event = document.events.find((row) => row.id === input.eventId)
  if (!event)
    throw new FinanceError(
      "NOT_FOUND",
      "Purchase fact not found in this document.",
    )
  if (event.reversal || event.journalEntry.reversal)
    throw new FinanceError(
      "CONFLICT",
      "This purchase fact is already corrected.",
    )
  const { debit, credit } = await verifyPurchaseRecognitionEvent(
    tx,
    document,
    event,
  )
  assertPurchaseRecognitionReversal(
    event.stage,
    event.journalEntry.sequence,
    document.events
      .filter((row) => row.originalStage && !row.reversal)
      .map((row) => row.journalEntry.sequence),
  )
  if (document.events.some((row) => row.effectiveAt > input.effectiveAt))
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A correction cannot precede the latest purchase fact.",
    )
  let settlement: {
    latestAt: string | null
    paidMinor: string
    cashPaidMinor: string
    allocatedMinor: string
    releasedMinor: string
  } | null = null
  if (event.invoiceBill) {
    const latest = await tx.financeSupplierEntry.aggregate({
      where: { bookId: book.id, billId: event.invoiceBill.id },
      _max: { effectiveAt: true },
    })
    if (latest._max.effectiveAt && input.effectiveAt < latest._max.effectiveAt)
      throw new FinanceError(
        "INVALID_JOURNAL",
        "A correction cannot precede the latest invoice settlement.",
      )
    const [payments, allocations, releases] = await Promise.all([
      tx.financeBillPayment.aggregate({
        where: {
          bookId: book.id,
          billId: event.invoiceBill.id,
          reversedAt: null,
        },
        _sum: { amountMinor: true },
      }),
      tx.financeSupplierAllocation.aggregate({
        where: { bookId: book.id, billId: event.invoiceBill.id },
        _sum: { amountMinor: true },
      }),
      tx.financeSupplierAllocationRelease.aggregate({
        where: {
          bookId: book.id,
          allocation: { billId: event.invoiceBill.id },
        },
        _sum: { amountMinor: true },
      }),
    ])
    settlement = {
      latestAt: latest._max.effectiveAt?.toISOString() ?? null,
      paidMinor: event.invoiceBill.paidMinor.toString(),
      cashPaidMinor: (payments._sum.amountMinor ?? 0n).toString(),
      allocatedMinor: (allocations._sum.amountMinor ?? 0n).toString(),
      releasedMinor: (releases._sum.amountMinor ?? 0n).toString(),
    }
    if (
      event.invoiceBill.voidedAt ||
      event.invoiceBill.paidMinor !== BigInt(0) ||
      (payments._sum.amountMinor ?? BigInt(0)) !== BigInt(0) ||
      (allocations._sum.amountMinor ?? BigInt(0)) !==
        (releases._sum.amountMinor ?? BigInt(0))
    )
      throw new FinanceError(
        "CONFLICT",
        "Reverse payments and release consumed advances before correcting this invoice.",
      )
  }
  return { document, event, debit, credit, settlement }
}

async function executeFinancePurchaseRecognitionReversal(
  tx: Prisma.TransactionClient,
  input: ReverseFinancePurchaseRecognitionInput,
  preparedSource?: Awaited<
    ReturnType<typeof resolvePurchaseRecognitionReversalSource>
  >,
) {
  const reason = purchaseRecognitionText(input.reason, "correction reason", 400)
  requirePurchaseDate(input.effectiveAt)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "REVERSE_PURCHASE_RECOGNITION",
    { ...payload, reason },
    async (book) => {
      const { document, event, debit, credit } =
        preparedSource ??
        (await resolvePurchaseRecognitionReversalSource(tx, input, book))
      const reversalId = randomUUID()
      const journal = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "recognition-reversal",
        ),
        sourceKind: "PURCHASE_RECOGNITION_REVERSAL",
        sourceId: reversalId,
        reversalOfId: event.journalEntryId,
        description: reason,
        storeId: document.storeId,
        lines: [
          {
            accountId: credit.id,
            side: "DEBIT",
            amountMinor: document.costBill.totalMinor.toString(),
          },
          {
            accountId: debit.id,
            side: "CREDIT",
            amountMinor: document.costBill.totalMinor.toString(),
          },
        ],
      })
      const journalEntryId = purchaseJournalEntryId(journal)
      await tx.financePurchaseRecognitionEvent.create({
        data: {
          id: reversalId,
          bookId: book.id,
          supplierId: document.supplierId,
          recognitionId: document.id,
          stage: event.stage,
          journalEntryId,
          debitAccountId: credit.id,
          creditAccountId: debit.id,
          effectiveAt: input.effectiveAt,
          reference: event.reference,
          actorUserId: input.actorUserId,
          reversalOfId: event.id,
          reason,
        },
      })
      if (event.invoiceBill) {
        const original = event.invoiceBill.supplierEntries[0]
        if (!original)
          throw new FinanceError(
            "CONFLICT",
            "The invoice supplier source is missing.",
          )
        await tx.financeSupplierEntry.create({
          data: {
            bookId: book.id,
            supplierId: document.supplierId,
            kind: "REVERSAL",
            side: "DEBIT",
            amountMinor: document.costBill.totalMinor,
            journalEntryId,
            effectiveAt: input.effectiveAt,
            actorUserId: input.actorUserId,
            description: reason,
            reversalOfId: original.id,
            billId: event.invoiceBill.id,
          },
        })
        await tx.financeBill.update({
          where: { id: event.invoiceBill.id },
          data: {
            voidedAt: new Date(),
            voidEffectiveAt: input.effectiveAt,
            voidedById: input.actorUserId,
            voidReason: reason,
          },
        })
      }
      return { id: reversalId }
    },
  )
}

export async function reverseFinancePurchaseRecognition(
  db: PrismaClient,
  input: ReverseFinancePurchaseRecognitionInput,
) {
  return db.$transaction(
    (tx) => reverseFinancePurchaseRecognitionInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

async function loadPurchaseRecognitionReversalReview(
  tx: Prisma.TransactionClient,
  input: Omit<ReverseFinancePurchaseRecognitionInput, "clientCommandId">,
  locked = false,
) {
  const reason = purchaseRecognitionText(input.reason, "correction reason", 400)
  requirePurchaseDate(input.effectiveAt)
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
  const source = await resolvePurchaseRecognitionReversalSource(tx, input, book)
  const { document, event, debit, credit, settlement } = source
  const store = await tx.store.findFirstOrThrow({
    where: { id: document.storeId, tenantId: input.tenantId },
    select: { id: true, name: true },
  })
  const review = {
    bookId: book.id,
    currencyCode: book.currencyCode,
    startsAt: book.startsAt.toISOString(),
    closedThrough: book.closedThrough?.toISOString() ?? null,
    recognitionId: document.id,
    eventId: event.id,
    stage: event.stage,
    supplierId: document.supplierId,
    supplierName: document.costBill.payeeName,
    storeId: store.id,
    storeName: store.name,
    description: document.costBill.description,
    costBillId: document.costBillId,
    totalMinor: document.costBill.totalMinor.toString(),
    originalEffectiveAt: event.effectiveAt.toISOString(),
    originalActorUserId: event.actorUserId,
    reference: event.reference,
    originalJournalId: event.journalEntryId,
    originalSequence: event.journalEntry.sequence.toString(),
    invoiceBillId: event.invoiceBillId,
    effectiveAt: input.effectiveAt.toISOString(),
    reason,
    settlement,
    payableDecreaseMinor:
      event.stage === "INVOICE" ? document.costBill.totalMinor.toString() : "0",
    invoiceWillBeVoided: event.stage === "INVOICE",
    goods: [...document.lines]
      .sort((a, b) => a.costBillLine.position - b.costBillLine.position)
      .map((l) => ({
        lineId: l.id,
        description: l.costBillLine.description,
        amountMinor: l.costBillLine.amountMinor.toString(),
        enteredQuantity: l.enteredQuantity.toFixed(),
        enteredUnitName: l.enteredInventoryUnit.name,
        balanceSourceId: l.balanceSourceId,
        configurationVersionId: l.configurationVersionId,
      })),
    events: document.events.map((e) => ({
      id: e.id,
      stage: e.stage,
      originalStage: e.originalStage,
      sequence: e.journalEntry.sequence.toString(),
      effectiveAt: e.effectiveAt.toISOString(),
      journalEntryId: e.journalEntryId,
      reversalId: e.reversal?.id ?? null,
      reversalOfId: e.reversalOfId,
    })),
    debit: {
      accountId: credit.id,
      accountName: credit.name,
      code: credit.code,
      amountMinor: document.costBill.totalMinor.toString(),
    },
    credit: {
      accountId: debit.id,
      accountName: debit.name,
      code: debit.code,
      amountMinor: document.costBill.totalMinor.toString(),
    },
    stockEffect: "NONE" as const,
    moneyTransfer: "NOT_PERFORMED" as const,
  }
  return { review, source }
}
export async function getFinancePurchaseRecognitionReversalReview(
  tx: Prisma.TransactionClient,
  input: Omit<ReverseFinancePurchaseRecognitionInput, "clientCommandId">,
) {
  return (await loadPurchaseRecognitionReversalReview(tx, input)).review
}
export async function reverseFinancePurchaseRecognitionInTransaction(
  tx: Prisma.TransactionClient,
  input: ReverseFinancePurchaseRecognitionInput,
) {
  return executeFinancePurchaseRecognitionReversal(tx, input)
}
/** Original proof remains private to this freshly locked transaction and one command. */
export async function prepareReviewedFinancePurchaseRecognitionReversalInTransaction(
  tx: Prisma.TransactionClient,
  input: Omit<ReverseFinancePurchaseRecognitionInput, "clientCommandId">,
) {
  const owned = {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    bookId: input.bookId,
    recognitionId: input.recognitionId,
    eventId: input.eventId,
    effectiveAt: new Date(input.effectiveAt),
    reason: input.reason,
  }
  const { review, source } = await loadPurchaseRecognitionReversalReview(
    tx,
    owned,
    true,
  )
  let commandId: string | undefined
  let execution:
    | ReturnType<typeof executeFinancePurchaseRecognitionReversal>
    | undefined
  return {
    review,
    execute: (clientCommandId: string) => {
      if (commandId !== undefined && commandId !== clientCommandId)
        throw new FinanceError(
          "CONFLICT",
          "Prepared purchase correction is bound to one command.",
        )
      commandId = clientCommandId
      return (execution ??= executeFinancePurchaseRecognitionReversal(
        tx,
        { ...owned, clientCommandId },
        source,
      ))
    },
  }
}
