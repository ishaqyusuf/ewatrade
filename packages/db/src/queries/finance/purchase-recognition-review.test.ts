import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { getFinancePurchaseRecognitionReview } from "./purchase-recognition-review"
import { normalizePurchaseRecognition } from "./purchase-recognition-preparation"

const agreedAt = new Date("2026-09-01T12:00:00.123Z")
const input = { tenantId: "tenant", actorUserId: "owner", bookId: "book", recognitionId: "purchase",
  stage: "INVOICE" as const, effectiveAt: new Date("2026-09-02T12:00:00.123Z"),
  reference: " Invoice 001 ", invoiceAmountMinor: "1100" }
function fixture(change: { denied?: boolean; book?: boolean; closed?: boolean; cost?: boolean; store?: boolean; account?: boolean; corrected?: boolean } = {}) {
  const costLine = { id: "cost-line", bookId: "book", billId: "cost", position: 0, accountId: "inventory", description: "Flour", amountMinor: 1100n }
  const document = { id: "purchase", tenantId: "tenant", bookId: "book", supplierId: "supplier", storeId: "store", actorUserId: "owner", costBillId: "cost", agreedAt,
    costBill: { id: "cost", bookId: "book", storeId: "store", supplierId: "supplier", actorUserId: "owner", kind: "PURCHASE_ACCRUAL", paidMinor: 0n, voidedAt: null, incurredAt: agreedAt, totalMinor: change.cost ? 1200n : 1100n, payeeName: "ACME", description: "Agreed flour", lines: [costLine] },
    lines: [{ id: "line", tenantId: "tenant", bookId: "book", recognitionId: "purchase", costBillId: "cost", costBillLineId: "cost-line", costBillLine: costLine, balanceSourceId: "balance", configurationVersionId: "config", enteredQuantity: { toFixed: () => "2.125" }, enteredInventoryUnit: { name: "bag" } }],
    events: change.corrected ? [{ reversalOfId: "original", effectiveAt: input.effectiveAt }] : [],
  }
  const book = { id: "book", currencyCode: "NGN", startsAt: new Date("2026-01-01"), closedThrough: change.closed ? new Date("2026-09-03") : null }
  const control = { id: "inventory", bookId: "book", name: "Inventory", code: "1300", kind: "ASSET", purpose: "INVENTORY", archivedAt: null }
  return {
    $queryRaw: async () => [],
    membership: { findFirst: async () => change.denied ? null : { tenant: { isActive: true } } },
    financeBook: {
      findFirst: async (args: unknown) => { expect(args).toMatchObject({ where: { id: "book", tenantId: "tenant" } }); return change.book ? null : book },
      findUniqueOrThrow: async () => book,
    },
    financePurchaseRecognition: { findFirst: async (args: unknown) => { expect(args).toMatchObject({ where: { id: "purchase", bookId: "book", tenantId: "tenant" } }); return document } },
    financeAccount: { findUnique: async ({ where }: { where: { bookId_code: { code: string } } }) => {
      const code = where.bookId_code.code
      if (code === "1300") return control
      if (code === "2000") return { ...control, id: "payable", name: "Supplier payable", code, kind: "LIABILITY", purpose: "PAYABLE" }
      return change.account ? { ...control, code, archivedAt: new Date() } : null
    }, upsert: async () => { throw Error("Advisory review wrote an account") } },
    store: { findFirst: async () => change.store ? null : { id: "store" }, findFirstOrThrow: async () => ({ id: "store", name: "Main Store" }) },
  } as unknown as Prisma.TransactionClient
}
test("invoice review reports exact payable and canonical controls without creating accounts", async () => {
  expect(await getFinancePurchaseRecognitionReview(fixture(), input)).toMatchObject({
    supplierName: "ACME", storeName: "Main Store", totalMinor: "1100", payableIncreaseMinor: "1100",
    effectiveAt: input.effectiveAt.toISOString(), reference: "Invoice 001", invoiceBillWillBeCreated: true,
    debit: { code: "1340", accountId: null, willCreate: true }, credit: { code: "2000", accountId: "payable", willCreate: false },
    goods: [{ enteredQuantity: "2.125", enteredUnitName: "bag", amountMinor: "1100" }],
    stockEffect: "NONE", moneyTransfer: "NOT_PERFORMED", matching: "EXACT_WHOLE_DOCUMENT",
  })
})
test("ownership-first review records transit and no new supplier payable", async () => {
  expect(await getFinancePurchaseRecognitionReview(fixture(), { ...input, stage: "OWNERSHIP", invoiceAmountMinor: undefined })).toMatchObject({
    stage: "OWNERSHIP", invoiceBillWillBeCreated: false, payableIncreaseMinor: "0",
    debit: { code: "1310", willCreate: true }, credit: { code: "2050", willCreate: true }, stockEffect: "NONE",
  })
})
test("review rejects authority, Book, closed period, corrupted costs/controls, Store and correction changes", async () => {
  for (const change of [{ denied: true }, { book: true }, { closed: true }, { cost: true }, { store: true }, { account: true }, { corrected: true }])
    await expect(getFinancePurchaseRecognitionReview(fixture(change), input)).rejects.toBeDefined()
  await expect(getFinancePurchaseRecognitionReview(fixture(), { ...input, invoiceAmountMinor: "1000" })).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(getFinancePurchaseRecognitionReview(fixture(), { ...input, effectiveAt: new Date("2026-08-31") })).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
})
test("shared normalizer retains reference and exact amounts and refuses incompatible fact fields", () => {
  expect(normalizePurchaseRecognition(input)).toEqual({ reference: "Invoice 001", invoiceAmount: 1100n })
  for (const value of [{ ...input, reference: " " }, { ...input, effectiveAt: new Date("invalid") }, { ...input, invoiceAmountMinor: "1.2" }, { ...input, dueAt: new Date("2026-09-01") }, { ...input, receipts: [] }, { ...input, stage: "OWNERSHIP" as const }])
    expect(() => normalizePurchaseRecognition(value)).toThrow()
})
