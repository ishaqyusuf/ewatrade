import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  assertFinanceManager,
  lockFinanceBook,
  type FinanceActor,
} from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import {
  loadPurchaseRecognition,
  verifyPurchaseRecognitionEvent,
} from "./purchase-recognition-source"
import {
  getPurchaseControlAccount,
  purchaseJournalEntryId,
  requirePurchaseDate,
} from "./purchase-source"
import { FinanceError, financeAmount, assertFinancePostingDate } from "./rules"
import { assertOriginalSupplierPosting } from "./supplier-rules"

const PAYABLE_CODE = "2000"
const INVENTORY_CODE = "1300"
const ADVANCE_CODE = "1250"

export type PayFinancePurchaseBillInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  billId: string
  moneyAccountId: string
  amountMinor: string
  effectiveAt: Date
  reference?: string
  description?: string
}

export type ReverseFinancePurchasePaymentInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  paymentId: string
  effectiveAt: Date
  reason: string
}

export type AllocateFinanceSupplierAdvanceInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  billId: string
  advanceEntryId: string
  amountMinor: string
  effectiveAt: Date
  description: string
}

export type ReleaseFinanceSupplierAllocationInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  allocationId: string
  amountMinor: string
  effectiveAt: Date
  reason: string
}

type Transaction = Prisma.TransactionClient

function text(value: string, label: string, maximum = 400) {
  const normalized = value.trim()
  if (!normalized || normalized.length > maximum) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      `Enter a ${label} of 1–${maximum} characters.`,
    )
  }
  return normalized
}

function requireNotBeforeLatest(effectiveAt: Date, latest: Date | null) {
  if (latest && effectiveAt < latest) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A settlement cannot precede the latest related supplier entry.",
    )
  }
}

async function getLatestBillSupplierEntryAt(
  tx: Transaction,
  bookId: string,
  billId: string,
) {
  const result = await tx.financeSupplierEntry.aggregate({
    where: { bookId, billId },
    _max: { effectiveAt: true },
  })
  return result._max.effectiveAt
}

async function getLatestAdvanceSettlementAt(
  tx: Transaction,
  bookId: string,
  advanceEntryId: string,
) {
  const [allocations, releases] = await Promise.all([
    tx.financeSupplierAllocation.aggregate({
      where: { bookId, advanceEntryId },
      _max: { effectiveAt: true },
    }),
    tx.financeSupplierAllocationRelease.aggregate({
      where: { bookId, allocation: { advanceEntryId } },
      _max: { effectiveAt: true },
    }),
  ])
  const allocationAt = allocations._max.effectiveAt
  const releaseAt = releases._max.effectiveAt
  if (!allocationAt) return releaseAt
  if (!releaseAt) return allocationAt
  return allocationAt > releaseAt ? allocationAt : releaseAt
}

function assertPostingHeader(input: {
  journal: {
    sourceKind: string
    sourceId: string
    actorUserId: string
    effectiveAt: Date
    reversalOfId: string | null
  }
  sourceKind: string
  sourceId: string
  actorUserId: string
  effectiveAt: Date
}) {
  if (
    input.journal.sourceKind !== input.sourceKind ||
    input.journal.sourceId !== input.sourceId ||
    input.journal.actorUserId !== input.actorUserId ||
    input.journal.effectiveAt.getTime() !== input.effectiveAt.getTime() ||
    input.journal.reversalOfId !== null
  ) {
    throw new FinanceError(
      "CONFLICT",
      "The purchase source does not match its original journal.",
    )
  }
}

async function verifyPurchaseBill(
  tx: Transaction,
  bookId: string,
  billId: string,
) {
  const bill = await tx.financeBill.findFirst({
    where: { id: billId, bookId, kind: "PURCHASE", supplierId: { not: null } },
    include: {
      recognitionEvent: { select: { recognitionId: true } },
      lines: {
        include: { purchaseReceipt: true },
        orderBy: { position: "asc" },
      },
      supplierEntries: {
        where: { kind: "PURCHASE_BILL" },
        take: 2,
        include: {
          journalEntry: {
            include: { lines: true, reversal: { select: { id: true } } },
          },
        },
      },
    },
  })
  if (!bill || bill.voidedAt || !bill.supplierId) {
    throw new FinanceError(
      "NOT_FOUND",
      "Purchase bill not found in this financial book.",
    )
  }
  const supplierEntry = bill.supplierEntries[0]
  if (bill.recognitionEvent) {
    const book = await tx.financeBook.findUniqueOrThrow({
      where: { id: bookId },
      select: { tenantId: true },
    })
    const document = await loadPurchaseRecognition(tx, {
      bookId,
      tenantId: book.tenantId,
      actorUserId: bill.actorUserId,
      recognitionId: bill.recognitionEvent.recognitionId,
    })
    const event = document.events.find(
      (row) => row.originalStage === "INVOICE" && row.invoiceBillId === bill.id,
    )
    if (
      !event ||
      event.reversal ||
      event.journalEntry.reversal ||
      !supplierEntry
    )
      throw new FinanceError(
        "CONFLICT",
        "The purchase invoice source was corrected or is incomplete.",
      )
    const { debit, credit } = await verifyPurchaseRecognitionEvent(
      tx,
      document,
      event,
    )
    return {
      bill,
      supplierEntry,
      journal: event.journalEntry,
      payable: credit,
      inventory: debit,
    }
  }
  const inventory = await getPurchaseControlAccount(
    tx,
    bookId,
    INVENTORY_CODE,
    "ASSET",
    "INVENTORY",
  )
  const payable = await getPurchaseControlAccount(
    tx,
    bookId,
    PAYABLE_CODE,
    "LIABILITY",
    "PAYABLE",
  )
  const linesTotal = bill.lines.reduce(
    (sum, line) => sum + line.amountMinor,
    BigInt(0),
  )
  const journal = supplierEntry?.journalEntry
  const debits =
    journal?.lines.filter(
      (line) => line.accountId === inventory.id && line.debitMinor > BigInt(0),
    ) ?? []
  const inventoryDebit = debits[0]
  if (
    bill.supplierEntries.length !== 1 ||
    !supplierEntry ||
    !journal ||
    supplierEntry.side !== "CREDIT" ||
    supplierEntry.amountMinor !== bill.totalMinor ||
    supplierEntry.billId !== bill.id ||
    supplierEntry.supplierId !== bill.supplierId ||
    supplierEntry.actorUserId !== bill.actorUserId ||
    supplierEntry.effectiveAt.getTime() !== bill.incurredAt.getTime() ||
    supplierEntry.description !== bill.description ||
    supplierEntry.paymentId !== null ||
    supplierEntry.moneyAccountId !== null ||
    supplierEntry.reversalOfId !== null ||
    journal.sourceKind !== "PURCHASE_BILL" ||
    journal.sourceId !== bill.id ||
    journal.actorUserId !== bill.actorUserId ||
    journal.effectiveAt.getTime() !== bill.incurredAt.getTime() ||
    journal.description !== bill.description ||
    journal.storeId !== bill.storeId ||
    journal.reversalOfId !== null ||
    journal.reversal !== null ||
    journal.lines.length !== 2 ||
    linesTotal !== bill.totalMinor ||
    bill.lines.length === 0 ||
    bill.lines.some(
      (line) =>
        !line.purchaseReceipt ||
        line.accountId !== inventory.id ||
        line.amountMinor <= BigInt(0),
    ) ||
    debits.length !== 1 ||
    !inventoryDebit ||
    inventoryDebit.debitMinor !== bill.totalMinor ||
    inventoryDebit.creditMinor !== BigInt(0) ||
    !journal.lines.some(
      (line) =>
        line.accountId === payable.id &&
        line.creditMinor === bill.totalMinor &&
        line.debitMinor === BigInt(0),
    )
  )
    throw new FinanceError(
      "CONFLICT",
      "The purchase bill does not have complete receipt and posting provenance.",
    )
  return {
    bill,
    supplierEntry,
    journal,
    payable,
    inventory,
  }
}

export async function payFinancePurchaseBillInTransaction(
  tx: Transaction,
  input: PayFinancePurchaseBillInput,
) {
  const amount = financeAmount(input.amountMinor)
  requirePurchaseDate(input.effectiveAt)
  if (input.reference && input.reference.length > 160)
    throw new FinanceError("INVALID_JOURNAL", "Check the payment reference.")
  const description = input.description
    ? text(input.description, "description")
    : undefined
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "PAY_PURCHASE_BILL",
    { ...payload, description: description ?? null },
    async (book) => {
      const { bill, supplierEntry, payable, money, supplierId } =
        await reviewPurchasePaymentSource(tx, input, book.id)
      const payment = await tx.financeBillPayment.create({
        data: {
          bookId: book.id,
          billId: bill.id,
          accountId: money.id,
          amountMinor: amount,
          effectiveAt: input.effectiveAt,
          reference: input.reference?.trim() || null,
          actorUserId: input.actorUserId,
        },
      })
      const journalResult = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "purchase-payment",
        ),
        sourceKind: "PURCHASE_PAYMENT",
        sourceId: payment.id,
        storeId: bill.storeId ?? undefined,
        description: description ?? `Purchase payment: ${bill.description}`,
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
      await tx.financeSupplierEntry.create({
        data: {
          bookId: book.id,
          supplierId,
          kind: "PURCHASE_PAYMENT",
          side: "DEBIT",
          amountMinor: amount,
          journalEntryId: purchaseJournalEntryId(journalResult),
          moneyAccountId: money.id,
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
          description: description ?? `Purchase payment: ${bill.description}`,
          billId: bill.id,
          paymentId: payment.id,
        },
      })
      await tx.financeBill.update({
        where: { id: bill.id },
        data: { paidMinor: { increment: amount } },
      })
      void supplierEntry
      return { id: payment.id }
    },
  )
}

export async function reverseFinancePurchasePaymentInTransaction(
  tx: Transaction,
  input: ReverseFinancePurchasePaymentInput,
) {
  requirePurchaseDate(input.effectiveAt)
  const reason = text(input.reason, "reversal reason")
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "REVERSE_PURCHASE_PAYMENT",
    { ...payload, reason },
    async (book) => {
      const payment = await tx.financeBillPayment.findFirst({
        where: { id: input.paymentId, bookId: book.id },
        include: {
          bill: true,
          account: true,
          supplierEntry: {
            include: {
              journalEntry: {
                include: { lines: true, reversal: { select: { id: true } } },
              },
              reversals: { select: { id: true } },
            },
          },
        },
      })
      if (
        !payment ||
        payment.bill.kind !== "PURCHASE" ||
        !payment.bill.supplierId ||
        !payment.supplierEntry
      )
        throw new FinanceError(
          "NOT_FOUND",
          "Purchase payment not found in this financial book.",
        )
      if (
        payment.reversedAt ||
        payment.supplierEntry.reversals.length ||
        payment.supplierEntry.journalEntry.reversal
      )
        throw new FinanceError(
          "CONFLICT",
          "This purchase payment has already been reversed.",
        )
      if (input.effectiveAt < payment.effectiveAt)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "A reversal cannot precede the purchase payment.",
        )
      const { bill: verifiedBill } = await verifyPurchaseBill(
        tx,
        book.id,
        payment.billId,
      )
      requireNotBeforeLatest(
        input.effectiveAt,
        await getLatestBillSupplierEntryAt(tx, book.id, verifiedBill.id),
      )
      if (
        verifiedBill.supplierId !== payment.bill.supplierId ||
        payment.account.kind !== "ASSET" ||
        !["CASH", "BANK", "CLEARING"].includes(payment.account.purpose)
      )
        throw new FinanceError(
          "CONFLICT",
          "The purchase payment no longer matches an active purchase source.",
        )
      const source = payment.supplierEntry
      const journal = source.journalEntry
      assertPostingHeader({
        journal,
        sourceKind: "PURCHASE_PAYMENT",
        sourceId: payment.id,
        actorUserId: payment.actorUserId,
        effectiveAt: payment.effectiveAt,
      })
      if (
        source.kind !== "PURCHASE_PAYMENT" ||
        source.side !== "DEBIT" ||
        source.bookId !== book.id ||
        source.supplierId !== payment.bill.supplierId ||
        source.billId !== payment.billId ||
        source.paymentId !== payment.id ||
        source.amountMinor !== payment.amountMinor ||
        source.moneyAccountId !== payment.accountId ||
        source.actorUserId !== payment.actorUserId ||
        source.effectiveAt.getTime() !== payment.effectiveAt.getTime() ||
        source.description !== journal.description ||
        journal.storeId !== payment.bill.storeId ||
        journal.lines.length !== 2 ||
        !journal.lines.some(
          (line) =>
            line.accountId === source.moneyAccountId &&
            line.creditMinor === payment.amountMinor &&
            line.debitMinor === BigInt(0),
        ) ||
        !journal.lines.some(
          (line) =>
            line.accountId !== source.moneyAccountId &&
            line.debitMinor === payment.amountMinor &&
            line.creditMinor === BigInt(0),
        )
      )
        throw new FinanceError(
          "CONFLICT",
          "The purchase payment does not match its original journal.",
        )
      const payable = await getPurchaseControlAccount(
        tx,
        book.id,
        PAYABLE_CODE,
        "LIABILITY",
        "PAYABLE",
      )
      if (
        !journal.lines.some(
          (line) =>
            line.accountId === payable.id &&
            line.debitMinor === payment.amountMinor &&
            line.creditMinor === BigInt(0),
        )
      )
        throw new FinanceError(
          "CONFLICT",
          "The purchase payment did not debit Payable.",
        )
      if (payment.bill.paidMinor < payment.amountMinor)
        throw new FinanceError(
          "CONFLICT",
          "The purchase bill paid total cannot be reconciled.",
        )
      const reversalDescription = `Purchase payment reversal: ${reason}`
      const posted = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "purchase-payment-reversal",
        ),
        sourceKind: "PURCHASE_PAYMENT_REVERSAL",
        sourceId: source.id,
        reversalOfId: journal.id,
        storeId: payment.bill.storeId ?? undefined,
        description: reversalDescription,
        lines: journal.lines.map((line) => ({
          accountId: line.accountId,
          side:
            line.debitMinor > BigInt(0)
              ? ("CREDIT" as const)
              : ("DEBIT" as const),
          amountMinor: (line.debitMinor > BigInt(0)
            ? line.debitMinor
            : line.creditMinor
          ).toString(),
        })),
      })
      const entry = await tx.financeSupplierEntry.create({
        data: {
          bookId: book.id,
          supplierId: source.supplierId,
          kind: "REVERSAL",
          side: "CREDIT",
          amountMinor: source.amountMinor,
          journalEntryId: purchaseJournalEntryId(posted),
          moneyAccountId: source.moneyAccountId,
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
          description: reversalDescription,
          reversalOfId: source.id,
          billId: source.billId,
        },
        select: { id: true },
      })
      await tx.financeBillPayment.update({
        where: { id: payment.id },
        data: {
          reversedAt: new Date(),
          reversalEffectiveAt: input.effectiveAt,
          reversedById: input.actorUserId,
          reversalReason: reason,
        },
      })
      await tx.financeBill.update({
        where: { id: payment.billId },
        data: { paidMinor: { decrement: payment.amountMinor } },
      })
      return { id: entry.id }
    },
  )
}

async function verifyAdvance(tx: Transaction, bookId: string, entryId: string) {
  const entry = await tx.financeSupplierEntry.findFirst({
    where: {
      id: entryId,
      bookId,
      kind: { in: ["OPENING_ADVANCE", "ADVANCE"] },
      reversalOfId: null,
      reversals: { none: {} },
    },
    include: {
      journalEntry: {
        include: { lines: true, reversal: { select: { id: true } } },
      },
      reversals: { select: { id: true } },
    },
  })
  if (!entry)
    throw new FinanceError(
      "NOT_FOUND",
      "An active supplier advance was not found in this financial book.",
    )
  if (entry.kind !== "OPENING_ADVANCE" && entry.kind !== "ADVANCE")
    throw new FinanceError(
      "CONFLICT",
      "The supplier source is not a supported advance entry.",
    )
  const advance = await getPurchaseControlAccount(
    tx,
    bookId,
    ADVANCE_CODE,
    "ASSET",
    "SUPPLIER_ADVANCE",
  )
  const payable = await getPurchaseControlAccount(
    tx,
    bookId,
    PAYABLE_CODE,
    "LIABILITY",
    "PAYABLE",
  )
  const equity = await getPurchaseControlAccount(
    tx,
    bookId,
    "3900",
    "EQUITY",
    "OPENING_EQUITY",
  )
  const book = await tx.financeBook.findUniqueOrThrow({
    where: { id: bookId },
    select: { startsAt: true },
  })
  assertOriginalSupplierPosting({
    kind: entry.kind,
    side: entry.side,
    amountMinor: entry.amountMinor,
    moneyAccountId: entry.moneyAccountId,
    entryId: entry.id,
    supplierId: entry.supplierId,
    supplierActorUserId: entry.actorUserId,
    supplierEffectiveAt: entry.effectiveAt,
    supplierDescription: entry.description,
    bookStartsAt: book.startsAt,
    journal: entry.journalEntry,
    advanceAccountId: advance.id,
    payableAccountId: payable.id,
    openingEquityAccountId: equity.id,
  })
  if (entry.journalEntry.reversal !== null || entry.reversals.length > 0)
    throw new FinanceError(
      "CONFLICT",
      "The supplier advance journal has already been reversed.",
    )
  return { entry, advance }
}

export async function allocateFinanceSupplierAdvanceInTransaction(
  tx: Transaction,
  input: AllocateFinanceSupplierAdvanceInput,
) {
  const amount = financeAmount(input.amountMinor)
  requirePurchaseDate(input.effectiveAt)
  const description = text(input.description, "description")
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "ALLOCATE_SUPPLIER_ADVANCE",
    { ...payload, description },
    async (book) => {
      const {
        bill,
        billEntry,
        payable,
        supplierId,
        advanceEntry,
        advance,
        remainingAdvance,
      } = await reviewSupplierAllocationSource(tx, input, book.id)
      const allocationId = randomUUID()
      const posted = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "supplier-advance-allocation",
        ),
        sourceKind: "SUPPLIER_ADVANCE_ALLOCATION",
        sourceId: allocationId,
        storeId: bill.storeId ?? undefined,
        description,
        lines: [
          {
            accountId: payable.id,
            side: "DEBIT",
            amountMinor: amount.toString(),
          },
          {
            accountId: advance.id,
            side: "CREDIT",
            amountMinor: amount.toString(),
          },
        ],
      })
      const supplierLine = await tx.financeSupplierEntry.create({
        data: {
          bookId: book.id,
          supplierId,
          kind: "ADVANCE_ALLOCATION",
          side: "DEBIT",
          amountMinor: amount,
          journalEntryId: purchaseJournalEntryId(posted),
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
          description,
          billId: bill.id,
        },
      })
      const allocation = await tx.financeSupplierAllocation.create({
        data: {
          id: allocationId,
          bookId: book.id,
          supplierId,
          billId: bill.id,
          advanceEntryId: advanceEntry.id,
          supplierEntryId: supplierLine.id,
          amountMinor: amount,
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
        },
      })
      await tx.financeBill.update({
        where: { id: bill.id },
        data: { paidMinor: { increment: amount } },
      })
      void billEntry
      return { id: allocation.id }
    },
  )
}

async function reviewSupplierAllocationReleaseSource(
  tx: Transaction,
  input: Omit<ReleaseFinanceSupplierAllocationInput, "clientCommandId">,
  bookId: string,
) {
  const amount = financeAmount(input.amountMinor)
  const allocation = await tx.financeSupplierAllocation.findFirst({
    where: { id: input.allocationId, bookId: bookId },
    include: {
      supplierEntry: {
        include: {
          journalEntry: {
            include: { lines: true, reversal: { select: { id: true } } },
          },
        },
      },
    },
  })
  if (!allocation)
    throw new FinanceError(
      "NOT_FOUND",
      "Supplier advance allocation not found in this financial book.",
    )
  const { bill, payable } = await verifyPurchaseBill(
    tx,
    bookId,
    allocation.billId,
  )
  const { entry: advanceEntry, advance } = await verifyAdvance(
    tx,
    bookId,
    allocation.advanceEntryId,
  )
  if (
    advanceEntry.supplierId !== allocation.supplierId ||
    bill.supplierId !== allocation.supplierId
  )
    throw new FinanceError(
      "CONFLICT",
      "The allocation source supplier no longer matches.",
    )
  if (input.effectiveAt < allocation.effectiveAt)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A release cannot precede its allocation.",
    )
  const [latestBillEntryAt, latestAdvanceSettlementAt] = await Promise.all([
    getLatestBillSupplierEntryAt(tx, bookId, bill.id),
    getLatestAdvanceSettlementAt(tx, bookId, advanceEntry.id),
  ])
  requireNotBeforeLatest(input.effectiveAt, latestBillEntryAt)
  requireNotBeforeLatest(input.effectiveAt, latestAdvanceSettlementAt)
  const [released, sourcePosting] = await Promise.all([
    tx.financeSupplierAllocationRelease.aggregate({
      where: { bookId: bookId, allocationId: allocation.id },
      _sum: { amountMinor: true },
    }),
    Promise.resolve(allocation.supplierEntry),
  ])
  const unreleased =
    allocation.amountMinor - (released._sum.amountMinor ?? BigInt(0))
  if (amount > unreleased || bill.paidMinor < amount)
    throw new FinanceError(
      "CONFLICT",
      "Release exceeds unreleased allocation or amount currently applied to the bill.",
    )
  assertPostingHeader({
    journal: sourcePosting.journalEntry,
    sourceKind: "SUPPLIER_ADVANCE_ALLOCATION",
    sourceId: allocation.id,
    actorUserId: allocation.actorUserId,
    effectiveAt: allocation.effectiveAt,
  })
  if (
    sourcePosting.kind !== "ADVANCE_ALLOCATION" ||
    sourcePosting.side !== "DEBIT" ||
    sourcePosting.billId !== bill.id ||
    sourcePosting.paymentId !== null ||
    sourcePosting.moneyAccountId !== null ||
    sourcePosting.supplierId !== bill.supplierId ||
    sourcePosting.amountMinor !== allocation.amountMinor ||
    sourcePosting.actorUserId !== allocation.actorUserId ||
    sourcePosting.effectiveAt.getTime() !== allocation.effectiveAt.getTime() ||
    sourcePosting.description !== sourcePosting.journalEntry.description ||
    sourcePosting.journalEntry.reversal !== null ||
    sourcePosting.journalEntry.storeId !== bill.storeId ||
    sourcePosting.journalEntry.lines.length !== 2 ||
    !sourcePosting.journalEntry.lines.some(
      (line) =>
        line.accountId === payable.id &&
        line.debitMinor === allocation.amountMinor &&
        line.creditMinor === BigInt(0),
    ) ||
    !sourcePosting.journalEntry.lines.some(
      (line) =>
        line.accountId === advance.id &&
        line.creditMinor === allocation.amountMinor &&
        line.debitMinor === BigInt(0),
    )
  )
    throw new FinanceError(
      "CONFLICT",
      "The allocation does not match its original journal.",
    )
  return { allocation, bill, payable, advanceEntry, advance, unreleased }
}

async function executeFinanceSupplierAllocationRelease(
  tx: Transaction,
  input: ReleaseFinanceSupplierAllocationInput,
  preparedSource?: Awaited<
    ReturnType<typeof reviewSupplierAllocationReleaseSource>
  >,
) {
  const amount = financeAmount(input.amountMinor)
  requirePurchaseDate(input.effectiveAt)
  const reason = text(input.reason, "release reason")
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "RELEASE_SUPPLIER_ALLOCATION",
    { ...payload, reason },
    async (book) => {
      const { allocation, bill, payable, advance } =
        preparedSource ??
        (await reviewSupplierAllocationReleaseSource(tx, input, book.id))
      const releaseId = randomUUID()
      const posted = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "supplier-allocation-release",
        ),
        sourceKind: "SUPPLIER_ALLOCATION_RELEASE",
        sourceId: releaseId,
        storeId: bill.storeId ?? undefined,
        description: `Release allocation: ${reason}`,
        lines: [
          {
            accountId: advance.id,
            side: "DEBIT",
            amountMinor: amount.toString(),
          },
          {
            accountId: payable.id,
            side: "CREDIT",
            amountMinor: amount.toString(),
          },
        ],
      })
      const entry = await tx.financeSupplierEntry.create({
        data: {
          bookId: book.id,
          supplierId: allocation.supplierId,
          kind: "ALLOCATION_RELEASE",
          side: "CREDIT",
          amountMinor: amount,
          journalEntryId: purchaseJournalEntryId(posted),
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
          description: `Release allocation: ${reason}`,
          billId: bill.id,
        },
      })
      const release = await tx.financeSupplierAllocationRelease.create({
        data: {
          id: releaseId,
          bookId: book.id,
          supplierId: allocation.supplierId,
          allocationId: allocation.id,
          supplierEntryId: entry.id,
          amountMinor: amount,
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
          reason,
        },
      })
      await tx.financeBill.update({
        where: { id: bill.id },
        data: { paidMinor: { decrement: amount } },
      })
      return { id: release.id }
    },
  )
}

export async function payFinancePurchaseBill(
  db: PrismaClient,
  input: PayFinancePurchaseBillInput,
) {
  return db.$transaction(
    (tx) => payFinancePurchaseBillInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
export async function reverseFinancePurchasePayment(
  db: PrismaClient,
  input: ReverseFinancePurchasePaymentInput,
) {
  return db.$transaction(
    (tx) => reverseFinancePurchasePaymentInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
export async function allocateFinanceSupplierAdvance(
  db: PrismaClient,
  input: AllocateFinanceSupplierAdvanceInput,
) {
  return db.$transaction(
    (tx) => allocateFinanceSupplierAdvanceInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
export async function releaseFinanceSupplierAllocation(
  db: PrismaClient,
  input: ReleaseFinanceSupplierAllocationInput,
) {
  return db.$transaction(
    (tx) => releaseFinanceSupplierAllocationInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

async function reviewPurchasePaymentSource(
  tx: Transaction,
  input: Omit<PayFinancePurchaseBillInput, "clientCommandId">,
  bookId: string,
) {
  const amount = financeAmount(input.amountMinor)
  const { bill, supplierEntry, payable } = await verifyPurchaseBill(
    tx,
    bookId,
    input.billId,
  )
  const supplierId = bill.supplierId
  if (!supplierId)
    throw new FinanceError("CONFLICT", "The purchase bill has no supplier.")
  if (input.effectiveAt < bill.incurredAt)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A payment cannot precede the purchase bill.",
    )
  requireNotBeforeLatest(
    input.effectiveAt,
    await getLatestBillSupplierEntryAt(tx, bookId, bill.id),
  )
  if (amount > bill.totalMinor - bill.paidMinor)
    throw new FinanceError(
      "CONFLICT",
      "Payment exceeds the purchase bill's outstanding amount.",
    )
  const money = await tx.financeAccount.findFirst({
    where: {
      id: input.moneyAccountId,
      bookId: bookId,
      kind: "ASSET",
      purpose: { in: ["CASH", "BANK", "CLEARING"] },
      archivedAt: null,
    },
  })
  if (!money)
    throw new FinanceError(
      "NOT_FOUND",
      "Choose an active cash, bank or clearing account in this business.",
    )
  return { bill, supplierEntry, payable, money, supplierId }
}

async function reviewSupplierAllocationSource(
  tx: Transaction,
  input: Omit<AllocateFinanceSupplierAdvanceInput, "clientCommandId">,
  bookId: string,
) {
  const amount = financeAmount(input.amountMinor)
  const {
    bill,
    supplierEntry: billEntry,
    payable,
  } = await verifyPurchaseBill(tx, bookId, input.billId)
  const supplierId = bill.supplierId
  if (!supplierId)
    throw new FinanceError("CONFLICT", "The purchase bill has no supplier.")
  const { entry: advanceEntry, advance } = await verifyAdvance(
    tx,
    bookId,
    input.advanceEntryId,
  )
  if (advanceEntry.supplierId !== bill.supplierId)
    throw new FinanceError(
      "CONFLICT",
      "The supplier advance and purchase bill belong to different suppliers.",
    )
  if (
    input.effectiveAt < bill.incurredAt ||
    input.effectiveAt < advanceEntry.effectiveAt
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "An allocation cannot precede its bill or advance.",
    )
  requireNotBeforeLatest(
    input.effectiveAt,
    await getLatestBillSupplierEntryAt(tx, bookId, bill.id),
  )
  const [allocated, released] = await Promise.all([
    tx.financeSupplierAllocation.aggregate({
      where: { bookId: bookId, advanceEntryId: advanceEntry.id },
      _sum: { amountMinor: true },
      _max: { effectiveAt: true },
    }),
    tx.financeSupplierAllocationRelease.aggregate({
      where: {
        bookId: bookId,
        allocation: { advanceEntryId: advanceEntry.id },
      },
      _sum: { amountMinor: true },
      _max: { effectiveAt: true },
    }),
  ])
  const latestAdvanceSettlementAt =
    allocated._max.effectiveAt && released._max.effectiveAt
      ? allocated._max.effectiveAt > released._max.effectiveAt
        ? allocated._max.effectiveAt
        : released._max.effectiveAt
      : (allocated._max.effectiveAt ?? released._max.effectiveAt)
  requireNotBeforeLatest(input.effectiveAt, latestAdvanceSettlementAt)
  const remainingAdvance =
    advanceEntry.amountMinor -
    (allocated._sum.amountMinor ?? BigInt(0)) +
    (released._sum.amountMinor ?? BigInt(0))
  if (amount > remainingAdvance || amount > bill.totalMinor - bill.paidMinor)
    throw new FinanceError(
      "CONFLICT",
      "Allocation exceeds the remaining advance or bill payable.",
    )
  return {
    bill,
    billEntry,
    payable,
    supplierId,
    advanceEntry,
    advance,
    remainingAdvance,
  }
}

async function settlementReviewBook(
  tx: Transaction,
  input: FinanceActor & { bookId: string; effectiveAt: Date },
  lockBook = false,
) {
  if (!lockBook) await assertFinanceManager(tx, input)
  requirePurchaseDate(input.effectiveAt)
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
  return book
}

export async function getFinancePurchasePaymentReview(
  tx: Transaction,
  input: Omit<PayFinancePurchaseBillInput, "clientCommandId">,
  lockBook = false,
) {
  const amount = financeAmount(input.amountMinor)
  if (input.reference && input.reference.length > 160)
    throw new FinanceError("INVALID_JOURNAL", "Check the payment reference.")
  const description = input.description
    ? text(input.description, "description")
    : undefined
  const book = await settlementReviewBook(tx, input, lockBook)
  const { bill, payable, money } = await reviewPurchasePaymentSource(
    tx,
    input,
    book.id,
  )
  const supplier = await tx.financeSupplierAccount.findFirstOrThrow({
    where: { id: bill.supplierId!, bookId: book.id },
    select: { id: true, name: true, code: true },
  })
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    startsAt: book.startsAt.toISOString(),
    closedThrough: book.closedThrough?.toISOString() ?? null,
    billId: bill.id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierCode: supplier.code,
    description: bill.description,
    incurredAt: bill.incurredAt.toISOString(),
    dueAt: bill.dueAt?.toISOString() ?? null,
    totalMinor: bill.totalMinor.toString(),
    paidBeforeMinor: bill.paidMinor.toString(),
    paidAfterMinor: (bill.paidMinor + amount).toString(),
    outstandingBeforeMinor: (bill.totalMinor - bill.paidMinor).toString(),
    outstandingAfterMinor: (
      bill.totalMinor -
      bill.paidMinor -
      amount
    ).toString(),
    amountMinor: amount.toString(),
    moneyAccountId: money.id,
    moneyAccountName: money.name,
    moneyAccountPurpose: money.purpose,
    payableAccountId: payable.id,
    payableAccountName: payable.name,
    effectiveAt: input.effectiveAt.toISOString(),
    reference: input.reference?.trim() || null,
    postingDescription: description ?? `Purchase payment: ${bill.description}`,
    effect: "RECORD_ALREADY_PAID_PURCHASE" as const,
    moneyTransfer: "NOT_PERFORMED" as const,
  }
}

export async function getFinanceSupplierAllocationReview(
  tx: Transaction,
  input: Omit<AllocateFinanceSupplierAdvanceInput, "clientCommandId">,
  lockBook = false,
) {
  const amount = financeAmount(input.amountMinor),
    description = text(input.description, "description")
  const book = await settlementReviewBook(tx, input, lockBook)
  const { bill, payable, supplierId, advanceEntry, advance, remainingAdvance } =
    await reviewSupplierAllocationSource(tx, input, book.id)
  const supplier = await tx.financeSupplierAccount.findFirstOrThrow({
    where: { id: supplierId, bookId: book.id },
    select: { id: true, name: true, code: true },
  })
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    startsAt: book.startsAt.toISOString(),
    closedThrough: book.closedThrough?.toISOString() ?? null,
    billId: bill.id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierCode: supplier.code,
    billDescription: bill.description,
    incurredAt: bill.incurredAt.toISOString(),
    dueAt: bill.dueAt?.toISOString() ?? null,
    totalMinor: bill.totalMinor.toString(),
    paidBeforeMinor: bill.paidMinor.toString(),
    paidAfterMinor: (bill.paidMinor + amount).toString(),
    outstandingBeforeMinor: (bill.totalMinor - bill.paidMinor).toString(),
    outstandingAfterMinor: (
      bill.totalMinor -
      bill.paidMinor -
      amount
    ).toString(),
    advanceEntryId: advanceEntry.id,
    advanceEffectiveAt: advanceEntry.effectiveAt.toISOString(),
    advanceOriginalMinor: advanceEntry.amountMinor.toString(),
    advanceBeforeMinor: remainingAdvance.toString(),
    advanceAfterMinor: (remainingAdvance - amount).toString(),
    payableAccountId: payable.id,
    payableAccountName: payable.name,
    advanceAccountId: advance.id,
    advanceAccountName: advance.name,
    amountMinor: amount.toString(),
    effectiveAt: input.effectiveAt.toISOString(),
    description,
    effect: "APPLY_EXISTING_SUPPLIER_ADVANCE" as const,
    moneyTransfer: "NOT_PERFORMED" as const,
  }
}

async function loadFinanceSupplierAllocationReleaseReview(
  tx: Transaction,
  input: Omit<ReleaseFinanceSupplierAllocationInput, "clientCommandId">,
  lockBook = false,
) {
  const amount = financeAmount(input.amountMinor)
  const reason = text(input.reason, "release reason")
  const book = await settlementReviewBook(tx, input, lockBook)
  const source = await reviewSupplierAllocationReleaseSource(tx, input, book.id)
  const { allocation, bill, payable, advanceEntry, advance, unreleased } =
    source
  const [supplier, allocated, released] = await Promise.all([
    tx.financeSupplierAccount.findFirstOrThrow({
      where: { id: allocation.supplierId, bookId: book.id },
      select: { id: true, name: true, code: true },
    }),
    tx.financeSupplierAllocation.aggregate({
      where: { bookId: book.id, advanceEntryId: advanceEntry.id },
      _sum: { amountMinor: true },
    }),
    tx.financeSupplierAllocationRelease.aggregate({
      where: {
        bookId: book.id,
        allocation: { advanceEntryId: advanceEntry.id },
      },
      _sum: { amountMinor: true },
    }),
  ])
  const advanceBefore =
    advanceEntry.amountMinor -
    (allocated._sum.amountMinor ?? 0n) +
    (released._sum.amountMinor ?? 0n)
  const review = {
    bookId: book.id,
    currencyCode: book.currencyCode,
    startsAt: book.startsAt.toISOString(),
    closedThrough: book.closedThrough?.toISOString() ?? null,
    allocationId: allocation.id,
    allocationEffectiveAt: allocation.effectiveAt.toISOString(),
    allocationOriginalMinor: allocation.amountMinor.toString(),
    allocationRemainingBeforeMinor: unreleased.toString(),
    allocationRemainingAfterMinor: (unreleased - amount).toString(),
    allocationJournalId: allocation.supplierEntry.journalEntryId,
    billId: bill.id,
    billDescription: bill.description,
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierCode: supplier.code,
    totalMinor: bill.totalMinor.toString(),
    paidBeforeMinor: bill.paidMinor.toString(),
    paidAfterMinor: (bill.paidMinor - amount).toString(),
    outstandingBeforeMinor: (bill.totalMinor - bill.paidMinor).toString(),
    outstandingAfterMinor: (
      bill.totalMinor -
      bill.paidMinor +
      amount
    ).toString(),
    advanceEntryId: advanceEntry.id,
    advanceEffectiveAt: advanceEntry.effectiveAt.toISOString(),
    advanceOriginalMinor: advanceEntry.amountMinor.toString(),
    advanceBeforeMinor: advanceBefore.toString(),
    advanceAfterMinor: (advanceBefore + amount).toString(),
    payableAccountId: payable.id,
    payableAccountName: payable.name,
    advanceAccountId: advance.id,
    advanceAccountName: advance.name,
    amountMinor: amount.toString(),
    effectiveAt: input.effectiveAt.toISOString(),
    reason,
    effect: "RELEASE_EXISTING_SUPPLIER_ALLOCATION" as const,
    moneyTransfer: "NOT_PERFORMED" as const,
  }
  return { review, source }
}

export async function getFinanceSupplierAllocationReleaseReview(
  tx: Transaction,
  input: Omit<ReleaseFinanceSupplierAllocationInput, "clientCommandId">,
  lockBook = false,
) {
  return (await loadFinanceSupplierAllocationReleaseReview(tx, input, lockBook))
    .review
}

export async function releaseFinanceSupplierAllocationInTransaction(
  tx: Transaction,
  input: ReleaseFinanceSupplierAllocationInput,
) {
  return executeFinanceSupplierAllocationRelease(tx, input)
}

/** Private source proof is loaded under the Book lock and remains in this transaction's closure. */
export async function prepareReviewedFinanceSupplierAllocationReleaseInTransaction(
  tx: Transaction,
  input: Omit<ReleaseFinanceSupplierAllocationInput, "clientCommandId">,
) {
  const owned = {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    bookId: input.bookId,
    allocationId: input.allocationId,
    amountMinor: input.amountMinor,
    effectiveAt: new Date(input.effectiveAt),
    reason: input.reason,
  }
  const { review, source } = await loadFinanceSupplierAllocationReleaseReview(
    tx,
    owned,
    true,
  )
  let commandId: string | undefined
  let execution:
    | ReturnType<typeof executeFinanceSupplierAllocationRelease>
    | undefined
  return {
    review,
    execute: (clientCommandId: string) => {
      if (commandId !== undefined && commandId !== clientCommandId)
        throw new FinanceError(
          "CONFLICT",
          "Prepared release is bound to one command.",
        )
      commandId = clientCommandId
      return (execution ??= executeFinanceSupplierAllocationRelease(
        tx,
        { ...owned, clientCommandId },
        source,
      ))
    },
  }
}
