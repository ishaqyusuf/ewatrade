import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { getFinancePurchaseRecognitionReversalReview } from "./purchase-recognition-reversals"
import { PURCHASE_RECOGNITION_CONTROLS } from "./purchase-recognition-rules"
const agreedAt = new Date("2026-09-01T12:00:00.123Z"),
  originalAt = new Date("2026-09-02T12:00:00.123Z")
const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  recognitionId: "purchase",
  eventId: "event",
  effectiveAt: new Date("2026-09-05T12:00:00.123Z"),
  reason: " Correct duplicate invoice fact ",
}
function fixture(
  o: {
    stage?: "INVOICE" | "OWNERSHIP" | "RECEIPT"
    denied?: boolean
    missingBook?: boolean
    missingEvent?: boolean
    reversed?: boolean
    journalReversed?: boolean
    closed?: boolean
    cost?: boolean
    archived?: boolean
    malformed?: boolean
    wrongStore?: boolean
    wrongActor?: boolean
    dependent?: boolean
    latestFact?: boolean
    latestSettlement?: boolean
    paid?: boolean
    cash?: boolean
    allocated?: boolean
    fullyReleased?: boolean
    voided?: boolean
    reversalEvent?: boolean
  } = {},
) {
  const stage = o.stage ?? "INVOICE",
    debitCode =
      stage === "INVOICE" ? "1340" : stage === "OWNERSHIP" ? "1310" : "1300",
    creditCode = stage === "INVOICE" ? "2000" : "2050"
  const account = (code: keyof typeof PURCHASE_RECOGNITION_CONTROLS) => ({
    id: code,
    bookId: "book",
    code,
    ...PURCHASE_RECOGNITION_CONTROLS[code],
    archivedAt: o.archived ? originalAt : null,
  })
  const costLine = {
    id: "cost-line",
    bookId: "book",
    billId: "cost",
    position: 0,
    accountId: "1300",
    description: "Flour",
    amountMinor: 1100n,
  }
  const journal = {
    id: "journal",
    sourceKind:
      stage === "INVOICE" ? "PURCHASE_BILL" : `PURCHASE_${stage}_RECOGNITION`,
    sourceId: stage === "INVOICE" ? "invoice" : "event",
    actorUserId: o.wrongActor ? "other" : "owner",
    effectiveAt: originalAt,
    description: "Agreed flour",
    storeId: "store",
    sequence: 1n,
    reversalOfId: null,
    reversal: o.journalReversed ? { id: "corrected" } : null,
    lines: [
      { accountId: debitCode, debitMinor: 1100n, creditMinor: 0n },
      {
        accountId: creditCode,
        debitMinor: 0n,
        creditMinor: o.malformed ? 1099n : 1100n,
      },
    ],
  }
  const event = {
    id: "event",
    bookId: "book",
    supplierId: "supplier",
    recognitionId: "purchase",
    stage,
    originalStage: o.reversalEvent ? null : stage,
    reversalOfId: o.reversalEvent ? "other" : null,
    reason: o.reversalEvent ? "Prior correction" : null,
    effectiveAt: originalAt,
    actorUserId: "owner",
    reference: "SOURCE-001",
    journalEntryId: "journal",
    debitAccountId: debitCode,
    creditAccountId: creditCode,
    journalEntry: journal,
    reversal: o.reversed ? { id: "corrected" } : null,
    invoiceBillId: stage === "INVOICE" ? "invoice" : null,
    invoiceBill:
      stage === "INVOICE"
        ? {
            id: "invoice",
            bookId: "book",
            kind: "PURCHASE",
            supplierId: "supplier",
            storeId: "store",
            actorUserId: "owner",
            incurredAt: originalAt,
            totalMinor: 1100n,
            paidMinor: o.paid ? 50n : 0n,
            description: "Agreed flour",
            reference: "SOURCE-001",
            voidedAt: o.voided ? originalAt : null,
            lines: [
              {
                ...costLine,
                id: "invoice-line",
                billId: "invoice",
                accountId: debitCode,
              },
            ],
            supplierEntries: [
              {
                id: "invoice-entry",
                kind: "PURCHASE_BILL",
                side: "CREDIT",
                amountMinor: 1100n,
                journalEntryId: "journal",
                actorUserId: "owner",
                effectiveAt: originalAt,
                description: "Agreed flour",
                moneyAccountId: null,
                paymentId: null,
                reversalOfId: null,
              },
            ],
          }
        : null,
  }
  const document = {
    id: "purchase",
    tenantId: "tenant",
    bookId: "book",
    supplierId: "supplier",
    storeId: "store",
    actorUserId: "owner",
    costBillId: "cost",
    agreedAt,
    costBill: {
      id: "cost",
      bookId: "book",
      storeId: "store",
      supplierId: "supplier",
      actorUserId: "owner",
      kind: "PURCHASE_ACCRUAL",
      paidMinor: 0n,
      voidedAt: null,
      incurredAt: agreedAt,
      totalMinor: o.cost ? 1200n : 1100n,
      payeeName: "ACME",
      description: "Agreed flour",
      lines: [costLine],
    },
    lines: [
      {
        id: "line",
        tenantId: "tenant",
        bookId: "book",
        recognitionId: "purchase",
        costBillId: "cost",
        costBillLineId: "cost-line",
        costBillLine: costLine,
        balanceSourceId: "balance",
        configurationVersionId: "config",
        enteredQuantity: { toFixed: () => "2.125" },
        enteredInventoryUnit: { name: "bag" },
      },
    ],
    events: [
      ...(o.missingEvent ? [] : [event]),
      ...(o.dependent || o.latestFact
        ? [
            {
              ...event,
              id: "later",
              stage: "OWNERSHIP",
              originalStage: o.dependent ? "OWNERSHIP" : null,
              journalEntry: { ...journal, sequence: 2n },
              effectiveAt: new Date(o.latestFact ? "2026-09-06" : "2026-09-03"),
            },
          ]
        : []),
    ],
  }
  const book = {
    id: "book",
    currencyCode: "NGN",
    startsAt: new Date("2026-01-01"),
    closedThrough: o.closed ? new Date("2026-09-06") : null,
  }
  return {
    $queryRaw: async () => [],
    membership: {
      findFirst: async () => (o.denied ? null : { tenant: { isActive: true } }),
    },
    financeBook: {
      findFirst: async (a: unknown) => {
        expect(a).toMatchObject({ where: { id: "book", tenantId: "tenant" } })
        return o.missingBook ? null : book
      },
      findUniqueOrThrow: async () => book,
    },
    financePurchaseRecognition: {
      findFirst: async (a: unknown) => {
        expect(a).toMatchObject({
          where: { id: "purchase", bookId: "book", tenantId: "tenant" },
        })
        return document
      },
    },
    financeAccount: {
      findUnique: async (a: {
        where: {
          bookId_code: {
            bookId: string
            code: keyof typeof PURCHASE_RECOGNITION_CONTROLS
          }
        }
      }) => {
        expect(a.where.bookId_code.bookId).toBe("book")
        return account(a.where.bookId_code.code)
      },
    },
    store: {
      findFirst: async () => (o.wrongStore ? null : { id: "store" }),
      findFirstOrThrow: async () => ({ id: "store", name: "Main Store" }),
    },
    financeSupplierEntry: {
      aggregate: async (a: unknown) => {
        expect(a).toMatchObject({
          where: { bookId: "book", billId: "invoice" },
        })
        return {
          _max: {
            effectiveAt: new Date(
              o.latestSettlement ? "2026-09-06" : "2026-09-04",
            ),
          },
        }
      },
    },
    financeBillPayment: {
      aggregate: async (a: unknown) => {
        expect(a).toMatchObject({
          where: { bookId: "book", billId: "invoice", reversedAt: null },
        })
        return { _sum: { amountMinor: o.cash ? 50n : 0n } }
      },
    },
    financeSupplierAllocation: {
      aggregate: async () => ({
        _sum: { amountMinor: o.allocated || o.fullyReleased ? 50n : 0n },
      }),
    },
    financeSupplierAllocationRelease: {
      aggregate: async () => ({
        _sum: { amountMinor: o.fullyReleased ? 50n : 0n },
      }),
    },
  } as unknown as Prisma.TransactionClient
}
test("unpaid invoice fact correction reverses exact original controls and voids only the invoice", async () => {
  const r = await getFinancePurchaseRecognitionReversalReview(fixture(), input)
  expect(r).toMatchObject({
    stage: "INVOICE",
    eventId: "event",
    originalJournalId: "journal",
    originalEffectiveAt: originalAt.toISOString(),
    effectiveAt: input.effectiveAt.toISOString(),
    reason: input.reason.trim(),
    totalMinor: "1100",
    invoiceBillId: "invoice",
    invoiceWillBeVoided: true,
    payableDecreaseMinor: "1100",
    stockEffect: "NONE",
    moneyTransfer: "NOT_PERFORMED",
    debit: { accountId: "2000" },
    credit: { accountId: "1340" },
    settlement: {
      paidMinor: "0",
      cashPaidMinor: "0",
      allocatedMinor: "0",
      releasedMinor: "0",
    },
  })
  expect(r.goods[0]).toMatchObject({
    amountMinor: "1100",
    enteredQuantity: "2.125",
    configurationVersionId: "config",
  })
  expect(
    (
      await getFinancePurchaseRecognitionReversalReview(
        fixture({ fullyReleased: true }),
        input,
      )
    ).settlement,
  ).toMatchObject({ allocatedMinor: "50", releasedMinor: "50" })
})
test("ownership correction reverses original transit controls without removing invoice payable or stock", async () => {
  expect(
    await getFinancePurchaseRecognitionReversalReview(
      fixture({ stage: "OWNERSHIP" }),
      input,
    ),
  ).toMatchObject({
    stage: "OWNERSHIP",
    invoiceBillId: null,
    invoiceWillBeVoided: false,
    payableDecreaseMinor: "0",
    settlement: null,
    debit: { accountId: "2050" },
    credit: { accountId: "1310" },
    stockEffect: "NONE",
  })
})
test("fact correction refuses physical receipt, dependents, settlement, malformed original proof and access/cutoff", async () => {
  for (const o of [
    { stage: "RECEIPT" as const },
    { denied: true },
    { missingBook: true },
    { missingEvent: true },
    { reversed: true },
    { journalReversed: true },
    { closed: true },
    { cost: true },
    { archived: true },
    { malformed: true },
    { wrongStore: true },
    { wrongActor: true },
    { dependent: true },
    { latestFact: true },
    { latestSettlement: true },
    { paid: true },
    { cash: true },
    { allocated: true },
    { voided: true },
    { reversalEvent: true },
  ])
    await expect(
      getFinancePurchaseRecognitionReversalReview(fixture(o), input),
    ).rejects.toThrow()
  await expect(
    getFinancePurchaseRecognitionReversalReview(fixture(), {
      ...input,
      effectiveAt: new Date("2026-09-01"),
    }),
  ).rejects.toThrow("cannot precede")
})
