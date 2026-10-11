import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  getFinancePurchasePaymentReview,
  getFinanceSupplierAllocationReview,
} from "./purchase-settlements"
const date = new Date("2026-10-05T12:00:00.123Z")
const base = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  billId: "bill",
  amountMinor: "250",
  effectiveAt: date,
  description: "Partial settlement",
}
function fixture(
  o: {
    denied?: boolean
    missingBook?: boolean
    closed?: boolean
    missingBill?: boolean
    voided?: boolean
    corrected?: boolean
    malformedBill?: boolean
    paid?: boolean
    money?: boolean
    missingAdvance?: boolean
    malformedAdvance?: boolean
    wrongSupplier?: boolean
    latestBill?: boolean
    latestAdvance?: boolean
    archivedControl?: boolean
  } = {},
) {
  const at = new Date("2026-10-01"),
    advanceAt = new Date("2026-10-02")
  const line = (
    accountId: string,
    debitMinor: bigint,
    creditMinor: bigint,
  ) => ({ accountId, debitMinor, creditMinor })
  const journal = {
    id: "journal",
    sourceKind: "PURCHASE_BILL",
    sourceId: "bill",
    actorUserId: "owner",
    effectiveAt: at,
    description: "Goods",
    storeId: "store",
    reversalOfId: null,
    reversal: o.corrected ? { id: "reversal" } : null,
    lines: [
      line("inventory", 1000n, 0n),
      line("payable", 0n, o.malformedBill ? 999n : 1000n),
    ],
  }
  const billEntry = {
    id: "bill-entry",
    side: "CREDIT",
    kind: "PURCHASE_BILL",
    amountMinor: 1000n,
    billId: "bill",
    supplierId: "supplier",
    actorUserId: "owner",
    effectiveAt: at,
    description: "Goods",
    paymentId: null,
    moneyAccountId: null,
    reversalOfId: null,
    journalEntry: journal,
  }
  const advance = {
    id: "advance-entry",
    kind: "ADVANCE",
    bookId: "book",
    supplierId: o.wrongSupplier ? "other" : "supplier",
    side: "DEBIT",
    amountMinor: 700n,
    actorUserId: "owner",
    effectiveAt: advanceAt,
    description: "Paid advance",
    moneyAccountId: "cash",
    reversalOfId: null,
    reversals: [],
    journalEntry: {
      sourceKind: "SUPPLIER_ADVANCE",
      sourceId: "advance-entry",
      actorUserId: "owner",
      effectiveAt: advanceAt,
      description: "Paid advance",
      reversalOfId: null,
      reversal: null,
      lines: [
        line("advance", 700n, 0n),
        line("cash", 0n, o.malformedAdvance ? 699n : 700n),
      ],
    },
  }
  return {
    $queryRaw: async () => [],
    membership: {
      findFirst: async () => (o.denied ? null : { tenant: { isActive: true } }),
    },
    financeBook: {
      findFirst: async (a: unknown) => {
        expect(a).toMatchObject({ where: { id: "book", tenantId: "tenant" } })
        return o.missingBook
          ? null
          : {
              id: "book",
              currencyCode: "NGN",
              startsAt: new Date("2026-01-01"),
              closedThrough: o.closed ? new Date("2026-10-06") : null,
            }
      },
      findUniqueOrThrow: async () => ({ startsAt: new Date("2026-01-01") }),
    },
    financeBill: {
      findFirst: async (a: unknown) => {
        expect(a).toMatchObject({
          where: {
            id: "bill",
            bookId: "book",
            kind: "PURCHASE",
            supplierId: { not: null },
          },
        })
        return o.missingBill
          ? null
          : {
              id: "bill",
              bookId: "book",
              supplierId: "supplier",
              actorUserId: "owner",
              storeId: "store",
              voidedAt: o.voided ? date : null,
              incurredAt: at,
              dueAt: null,
              description: "Goods",
              totalMinor: 1000n,
              paidMinor: o.paid ? 1000n : 100n,
              recognitionEvent: null,
              lines: [
                {
                  accountId: "inventory",
                  amountMinor: 1000n,
                  purchaseReceipt: { id: "receipt" },
                },
              ],
              supplierEntries: [billEntry],
            }
      },
    },
    financeSupplierAccount: {
      findFirstOrThrow: async (a: unknown) => {
        expect(a).toMatchObject({ where: { id: "supplier", bookId: "book" } })
        return { id: "supplier", name: "Recorded supplier", code: "SUP" }
      },
    },
    financeSupplierEntry: {
      aggregate: async (a: unknown) => {
        expect(a).toMatchObject({ where: { bookId: "book", billId: "bill" } })
        return {
          _max: {
            effectiveAt: o.latestBill
              ? new Date("2026-10-06")
              : new Date("2026-10-03"),
          },
        }
      },
      findFirst: async (a: unknown) => {
        expect(a).toMatchObject({
          where: {
            bookId: "book",
            id: "advance-entry",
            reversalOfId: null,
            reversals: { none: {} },
          },
        })
        return o.missingAdvance ? null : advance
      },
    },
    financeSupplierAllocation: {
      aggregate: async (a: unknown) => {
        expect(a).toMatchObject({
          where: { bookId: "book", advanceEntryId: "advance-entry" },
        })
        return {
          _sum: { amountMinor: 200n },
          _max: {
            effectiveAt: o.latestAdvance
              ? new Date("2026-10-06")
              : new Date("2026-10-03"),
          },
        }
      },
    },
    financeSupplierAllocationRelease: {
      aggregate: async (a: unknown) => {
        expect(a).toMatchObject({
          where: {
            bookId: "book",
            allocation: { advanceEntryId: "advance-entry" },
          },
        })
        return {
          _sum: { amountMinor: 50n },
          _max: { effectiveAt: new Date("2026-10-04") },
        }
      },
    },
    financeAccount: {
      findUnique: async (a: {
        where: { bookId_code: { bookId: string; code: string } }
      }) => {
        expect(a.where.bookId_code.bookId).toBe("book")
        const code = a.where.bookId_code.code
        return {
          id:
            code === "1300"
              ? "inventory"
              : code === "2000"
                ? "payable"
                : code === "1250"
                  ? "advance"
                  : "equity",
          name: code === "2000" ? "Supplier payable" : "Supplier advance",
          kind:
            code === "2000"
              ? "LIABILITY"
              : code === "3900"
                ? "EQUITY"
                : "ASSET",
          purpose:
            code === "1300"
              ? "INVENTORY"
              : code === "2000"
                ? "PAYABLE"
                : code === "1250"
                  ? "SUPPLIER_ADVANCE"
                  : "OPENING_EQUITY",
          archivedAt: o.archivedControl ? date : null,
        }
      },
      findFirst: async (a: unknown) => {
        expect(a).toMatchObject({
          where: { id: "cash", bookId: "book", archivedAt: null },
        })
        return o.money
          ? null
          : { id: "cash", name: "Shop cash", purpose: "CASH" }
      },
    },
  } as unknown as Prisma.TransactionClient
}
test("purchase payment review settles an exact existing source partially without another purchase", async () => {
  expect(
    await getFinancePurchasePaymentReview(fixture(), {
      ...base,
      moneyAccountId: "cash",
      reference: " PARTIAL ",
    }),
  ).toMatchObject({
    supplierName: "Recorded supplier",
    totalMinor: "1000",
    paidBeforeMinor: "100",
    paidAfterMinor: "350",
    outstandingBeforeMinor: "900",
    outstandingAfterMinor: "650",
    moneyAccountName: "Shop cash",
    reference: "PARTIAL",
    effectiveAt: date.toISOString(),
    moneyTransfer: "NOT_PERFORMED",
  })
})
test("purchase payment refuses wrong source, overpayment, authority, cutoff and chronology", async () => {
  for (const o of [
    { denied: true },
    { missingBook: true },
    { closed: true },
    { missingBill: true },
    { voided: true },
    { corrected: true },
    { malformedBill: true },
    { paid: true },
    { money: true },
    { latestBill: true },
    { archivedControl: true },
  ])
    await expect(
      getFinancePurchasePaymentReview(fixture(o), {
        ...base,
        moneyAccountId: "cash",
      }),
    ).rejects.toBeDefined()
  for (const p of [
    { amountMinor: "901" },
    { amountMinor: "0" },
    { effectiveAt: new Date("2026-09-30") },
    { effectiveAt: new Date("invalid") },
    { reference: "x".repeat(161) },
  ])
    await expect(
      getFinancePurchasePaymentReview(fixture(), {
        ...base,
        moneyAccountId: "cash",
        ...p,
      }),
    ).rejects.toBeDefined()
})
test("allocation review uses net unreleased original advance and separate invoice remaining amounts", async () => {
  expect(
    await getFinanceSupplierAllocationReview(fixture(), {
      ...base,
      advanceEntryId: "advance-entry",
    }),
  ).toMatchObject({
    advanceOriginalMinor: "700",
    advanceBeforeMinor: "550",
    advanceAfterMinor: "300",
    paidBeforeMinor: "100",
    paidAfterMinor: "350",
    outstandingBeforeMinor: "900",
    outstandingAfterMinor: "650",
    amountMinor: "250",
    effect: "APPLY_EXISTING_SUPPLIER_ADVANCE",
    moneyTransfer: "NOT_PERFORMED",
  })
})
test("allocation refuses missing or changed advance, different supplier, net over-allocation and chronology", async () => {
  for (const o of [
    { denied: true },
    { closed: true },
    { malformedBill: true },
    { missingAdvance: true },
    { malformedAdvance: true },
    { wrongSupplier: true },
    { latestBill: true },
    { latestAdvance: true },
    { paid: true },
  ])
    await expect(
      getFinanceSupplierAllocationReview(fixture(o), {
        ...base,
        advanceEntryId: "advance-entry",
      }),
    ).rejects.toBeDefined()
  for (const p of [
    { amountMinor: "551" },
    { amountMinor: "0" },
    { effectiveAt: new Date("2026-10-01") },
    { description: " " },
  ])
    await expect(
      getFinanceSupplierAllocationReview(fixture(), {
        ...base,
        advanceEntryId: "advance-entry",
        ...p,
      }),
    ).rejects.toBeDefined()
})
