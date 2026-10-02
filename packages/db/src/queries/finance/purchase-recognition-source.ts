import type { FinanceAccount, Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import {
  PURCHASE_RECOGNITION_CONTROLS,
  type PurchaseRecognitionControlCode,
  purchaseRecognitionPosting,
} from "./purchase-recognition-rules"
import { getPurchaseControlAccount } from "./purchase-source"
import { FinanceError, financeAmount } from "./rules"

export async function purchaseRecognitionControl(
  tx: Prisma.TransactionClient,
  bookId: string,
  code: PurchaseRecognitionControlCode,
  create = false,
) {
  const spec = PURCHASE_RECOGNITION_CONTROLS[code]
  if (create && !["1300", "2000"].includes(code)) {
    await tx.financeAccount.upsert({
      where: { bookId_code: { bookId, code } },
      create: { bookId, code, ...spec },
      update: {},
    })
  }
  return getPurchaseControlAccount(tx, bookId, code, spec.kind, spec.purpose)
}

export const purchaseRecognitionInclude = {
  costBill: {
    include: {
      lines: {
        take: 11,
        orderBy: { position: "asc" },
        include: { purchaseReceipt: { include: { valuationEvent: true } } },
      },
    },
  },
  lines: { take: 11, include: { costBillLine: true } },
  events: {
    take: 7,
    include: {
      journalEntry: { include: { lines: { take: 3 }, reversal: true } },
      reversal: true,
      invoiceBill: {
        include: {
          lines: { take: 11, orderBy: { position: "asc" } },
          supplierEntries: { where: { kind: "PURCHASE_BILL" }, take: 2 },
        },
      },
    },
    orderBy: { journalEntry: { sequence: "asc" } },
  },
} satisfies Prisma.FinancePurchaseRecognitionInclude

export async function loadPurchaseRecognition(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string; recognitionId: string },
) {
  const document = await tx.financePurchaseRecognition.findFirst({
    where: {
      id: input.recognitionId,
      bookId: input.bookId,
      tenantId: input.tenantId,
    },
    include: purchaseRecognitionInclude,
  })
  if (!document)
    throw new FinanceError(
      "NOT_FOUND",
      "Purchase recognition not found in this book.",
    )
  financeAmount(document.costBill.totalMinor.toString())
  const inventory = await getPurchaseControlAccount(
    tx,
    input.bookId,
    "1300",
    "ASSET",
    "INVENTORY",
  )
  assertLoadedPurchaseRecognitionCosts(document, input, inventory.id)
  const store = await tx.store.findFirst({
    where: {
      id: document.storeId,
      tenantId: input.tenantId,
      currencyCode: {
        equals: (
          await tx.financeBook.findUniqueOrThrow({
            where: { id: input.bookId },
            select: { currencyCode: true },
          })
        ).currencyCode,
      },
    },
    select: { id: true },
  })
  if (!store)
    throw new FinanceError(
      "CONFLICT",
      "The purchase Store scope or currency has changed.",
    )
  return document
}

export type PurchaseRecognitionDocument =
  Prisma.FinancePurchaseRecognitionGetPayload<{
    include: typeof purchaseRecognitionInclude
  }>

export function assertLoadedPurchaseRecognitionCosts(
  document: PurchaseRecognitionDocument,
  input: { tenantId: string; bookId: string },
  inventoryAccountId: string,
) {
  const bill = document.costBill
  const total = financeAmount(bill.totalMinor.toString())

  if (
    document.tenantId !== input.tenantId ||
    document.bookId !== input.bookId ||
    document.costBillId !== bill.id ||
    bill.bookId !== input.bookId ||
    bill.kind !== "PURCHASE_ACCRUAL" ||
    bill.voidedAt ||
    bill.paidMinor !== BigInt(0) ||
    bill.storeId !== document.storeId ||
    bill.supplierId !== document.supplierId ||
    bill.actorUserId !== document.actorUserId ||
    bill.incurredAt.getTime() !== document.agreedAt.getTime() ||
    document.lines.length < 1 ||
    document.lines.length > 10 ||
    bill.lines.length !== document.lines.length ||
    bill.lines.some(
      (line, position) =>
        line.accountId !== inventoryAccountId || line.position !== position,
    ) ||
    bill.lines.reduce(
      (sum, line) => sum + financeAmount(line.amountMinor.toString()),
      BigInt(0),
    ) !== total ||
    document.lines.some(
      (line) =>
        line.tenantId !== input.tenantId ||
        line.bookId !== input.bookId ||
        line.recognitionId !== document.id ||
        line.costBillId !== bill.id ||
        line.costBillLine.bookId !== input.bookId ||
        line.costBillLine.billId !== bill.id ||
        !bill.lines.some((cost) => cost.id === line.costBillLineId),
    )
  ) {
    throw new FinanceError(
      "CONFLICT",
      "The immutable purchase costs or scope have changed.",
    )
  }
}

export type PurchaseRecognitionEvent =
  PurchaseRecognitionDocument["events"][number]

/** Verify the original header and every line against source-owned facts. */
export async function verifyPurchaseRecognitionEvent(
  tx: Prisma.TransactionClient,
  document: PurchaseRecognitionDocument,
  event: PurchaseRecognitionEvent,
) {
  const journal = event.journalEntry
  if (
    event.originalStage !== event.stage ||
    event.reversalOfId ||
    event.reason !== null
  )
    throw new FinanceError("CONFLICT", "Choose an original purchase fact.")
  const prior = new Set(
    document.events
      .filter(
        (row) =>
          row.originalStage && row.journalEntry.sequence < journal.sequence,
      )
      .map((row) => row.stage),
  )
  const posting = purchaseRecognitionPosting(event.stage, prior)
  const debit = await purchaseRecognitionControl(
    tx,
    document.bookId,
    posting.debit,
  )
  const credit = await purchaseRecognitionControl(
    tx,
    document.bookId,
    posting.credit,
  )
  return verifyLoadedPurchaseRecognitionEvent(document, event, debit, credit)
}

export function verifyLoadedPurchaseRecognitionEvent(
  document: PurchaseRecognitionDocument,
  event: PurchaseRecognitionEvent,
  debit: FinanceAccount,
  credit: FinanceAccount,
) {
  const journal = event.journalEntry
  if (
    event.originalStage !== event.stage ||
    event.reversalOfId ||
    event.reason !== null
  )
    throw new FinanceError("CONFLICT", "Choose an original purchase fact.")
  const posting = purchaseRecognitionPosting(
    event.stage,
    new Set(
      document.events
        .filter(
          (row) =>
            row.originalStage && row.journalEntry.sequence < journal.sequence,
        )
        .map((row) => row.stage),
    ),
  )
  for (const [account, code] of [
    [debit, posting.debit],
    [credit, posting.credit],
  ] as const) {
    const spec = PURCHASE_RECOGNITION_CONTROLS[code]
    if (
      account.bookId !== document.bookId ||
      account.code !== code ||
      account.kind !== spec.kind ||
      account.purpose !== spec.purpose ||
      account.archivedAt
    )
      throw new FinanceError(
        "CONFLICT",
        `Purchase control account ${code} is unavailable or has changed.`,
      )
  }
  const invoice = event.invoiceBill
  const total = document.costBill.totalMinor
  const sourceKind =
    event.stage === "INVOICE"
      ? "PURCHASE_BILL"
      : `PURCHASE_${event.stage}_RECOGNITION`
  const debitLines = journal.lines.filter(
    (line) =>
      line.accountId === debit.id &&
      line.debitMinor === total &&
      line.creditMinor === BigInt(0),
  )
  const creditLines = journal.lines.filter(
    (line) =>
      line.accountId === credit.id &&
      line.creditMinor === total &&
      line.debitMinor === BigInt(0),
  )
  if (
    journal.sourceKind !== sourceKind ||
    journal.sourceId !==
      (event.stage === "INVOICE" ? event.invoiceBillId : event.id) ||
    journal.actorUserId !== event.actorUserId ||
    journal.effectiveAt.getTime() !== event.effectiveAt.getTime() ||
    journal.storeId !== document.storeId ||
    journal.description !== document.costBill.description ||
    journal.reversalOfId ||
    journal.lines.length !== 2 ||
    debitLines.length !== 1 ||
    creditLines.length !== 1 ||
    debit.id !== event.debitAccountId ||
    credit.id !== event.creditAccountId ||
    event.supplierId !== document.supplierId ||
    event.effectiveAt < document.agreedAt
  ) {
    throw new FinanceError(
      "CONFLICT",
      "The purchase fact does not match its immutable journal.",
    )
  }
  if (event.stage === "INVOICE") {
    const entry = invoice?.supplierEntries[0]
    if (
      !invoice ||
      invoice.id !== event.invoiceBillId ||
      invoice.kind !== "PURCHASE" ||
      invoice.bookId !== document.bookId ||
      invoice.supplierId !== document.supplierId ||
      invoice.storeId !== document.storeId ||
      invoice.totalMinor !== total ||
      invoice.actorUserId !== event.actorUserId ||
      invoice.incurredAt.getTime() !== event.effectiveAt.getTime() ||
      invoice.description !== document.costBill.description ||
      invoice.reference !== event.reference ||
      invoice.lines.length !== document.costBill.lines.length ||
      invoice.lines.some((line, index) => {
        const cost = document.costBill.lines[index]
        return (
          !cost ||
          line.position !== cost.position ||
          line.description !== cost.description ||
          line.amountMinor !== cost.amountMinor ||
          line.accountId !== debit.id
        )
      }) ||
      invoice.supplierEntries.length !== 1 ||
      !entry ||
      entry.kind !== "PURCHASE_BILL" ||
      entry.side !== "CREDIT" ||
      entry.amountMinor !== total ||
      entry.journalEntryId !== journal.id ||
      entry.actorUserId !== event.actorUserId ||
      entry.effectiveAt.getTime() !== event.effectiveAt.getTime() ||
      entry.description !== invoice.description ||
      entry.moneyAccountId ||
      entry.paymentId ||
      entry.reversalOfId
    ) {
      throw new FinanceError(
        "CONFLICT",
        "The invoice does not match its original purchase costs and supplier source.",
      )
    }
  } else if (event.invoiceBillId !== null) {
    throw new FinanceError(
      "CONFLICT",
      "Only an invoice can own a supplier bill.",
    )
  }
  return { debit, credit }
}
