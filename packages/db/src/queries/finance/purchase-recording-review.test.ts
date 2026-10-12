import { expect, test } from "bun:test"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import type { FinancePurchaseInput } from "./purchases"
import { normalizeFinancePurchase } from "./purchase-recording-input"
import {
  composeFinancePurchaseRecordingReview,
  financePurchaseRecordingReviewDigest,
  resolveFinancePurchaseRecordingSource,
} from "./purchase-recording-review"
const input: FinancePurchaseInput = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  clientCommandId: "command",
  supplierId: "supplier",
  storeId: "store",
  description: " Received goods ",
  reference: " REF ",
  incurredAt: new Date("2026-10-01T12:00:00.123Z"),
  dueAt: new Date("2026-10-08T12:00:00.123Z"),
  lines: [
    {
      balanceSourceId: "balance",
      enteredInventoryUnitId: "unit",
      expectedConfigurationVersionId: "config",
      expectedBalanceRevision: 3,
      enteredQuantity: parseExactDecimal("2.125"),
      amountMinor: "125",
      description: " Flour ",
      categories: [{ name: " Supplier  receipt " }],
    },
  ],
}
function fixture() {
  const state = {
    denied: false,
    calls: [] as string[],
    tenant: { isActive: true, currencyCode: "NGN" },
    book: {
      id: "book",
      tenantId: "tenant",
      currencyCode: "NGN",
      startsAt: new Date("2026-01-01T00:00:00Z"),
      closedThrough: null as Date | null,
    },
    supplier: { id: "supplier", bookId: "book", name: "ACME", code: "ACME" },
    store: {
      id: "store",
      tenantId: "tenant",
      currencyCode: "NGN",
      name: "Main",
    },
    accounts: [
      {
        id: "inventory",
        bookId: "book",
        code: "1300",
        name: "Inventory",
        kind: "ASSET",
        purpose: "INVENTORY",
        archivedAt: null as Date | null,
      },
      {
        id: "payable",
        bookId: "book",
        code: "2000",
        name: "Payable",
        kind: "LIABILITY",
        purpose: "PAYABLE",
        archivedAt: null as Date | null,
      },
    ],
    categories: [
      { id: 1, name: "Supplier receipt", normalizedName: "supplier receipt" },
    ],
  }
  const tx = {
    $queryRaw: async () => {
      state.calls.push("authority-lock")
      return []
    },
    membership: {
      findFirst: async (args: unknown) => {
        state.calls.push("authority")
        expect(args).toMatchObject({
          where: {
            tenantId: "tenant",
            userId: "owner",
            status: "ACTIVE",
            role: { in: ["OWNER", "ADMIN"] },
          },
        })
        return state.denied ? null : { tenant: state.tenant }
      },
    },
    financeSupplierAccount: {
      findFirst: async (args: unknown) => {
        expect(args).toMatchObject({
          where: { id: "supplier", bookId: "book" },
        })
        return state.supplier
      },
    },
    store: {
      findFirst: async (args: unknown) => {
        expect(args).toMatchObject({
          where: { id: "store", tenantId: "tenant", currencyCode: "NGN" },
        })
        return state.store
      },
    },
    financeAccount: {
      findUnique: async (args: {
        where: { bookId_code: { bookId: string; code: string } }
      }) => {
        expect(args.where.bookId_code.bookId).toBe("book")
        return (
          state.accounts.find((a) => a.code === args.where.bookId_code.code) ??
          null
        )
      },
    },
    financeInventoryPool: { findMany: async () => [] },
    stockMovement: { groupBy: async () => [] },
    stockOperationCategoryName: { findMany: async () => state.categories },
  } as unknown as Prisma.TransactionClient
  const stock = new Map([
    [
      "balance",
      {
        balanceSourceId: "balance",
        revision: 3,
        configurationVersionId: "config",
        catalogItemId: "item",
        productName: "Flour",
        variantName: "Regular",
        enteredUnitName: "kg",
        factor: "1",
        enteredQuantity: parseExactDecimal("2.125"),
        canonicalQuantity: parseExactDecimal("2.125"),
        balanceUnitName: "kg",
        before: parseExactDecimal("0"),
        after: parseExactDecimal("2.125"),
        reserved: parseExactDecimal("0"),
        availableAfter: parseExactDecimal("2.125"),
        sourceIncrease: parseExactDecimal("2.125"),
        canonicalBefore: parseExactDecimal("0"),
        currencyCode: "NGN",
      },
    ],
  ])
  return { state, tx, stock, book: state.book as FinanceBook }
}
test("direct purchase retains exact one-to-ten goods, category normalization and capped summed costs", () => {
  const maximum = {
    ...input,
    lines: Array.from({ length: 10 }, (_, i) => ({
      ...input.lines[0]!,
      balanceSourceId: `balance-${i}`,
      categories: Array.from({ length: 10 }, (_, c) => ({
        name: `Source ${i} ${c}`,
      })),
    })),
  }
  const n = normalizeFinancePurchase(maximum)
  expect(n.totalMinor).toBe(1250n)
  expect(n.lines).toHaveLength(10)
  expect(n.lines.flatMap((l) => l.categories)).toHaveLength(100)
  expect(n.lines.map((l) => l.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  expect(normalizeFinancePurchase(input).lines[0]).toMatchObject({
    amount: 125n,
    description: "Flour",
    categories: [{ name: "supplier receipt" }],
  })
  for (const change of [
    { lines: [] },
    {
      lines: Array.from({ length: 11 }, (_, i) => ({
        ...input.lines[0]!,
        balanceSourceId: `b${i}`,
      })),
    },
    { lines: [input.lines[0]!, input.lines[0]!] },
    { dueAt: new Date("2026-01-01") },
    { lines: [{ ...input.lines[0]!, amountMinor: "0" }] },
    {
      lines: [
        {
          ...input.lines[0]!,
          categories: Array.from({ length: 11 }, (_, i) => ({ name: `c${i}` })),
        },
      ],
    },
    {
      lines: [
        { ...input.lines[0]!, amountMinor: "100000000000000" },
        { ...input.lines[0]!, balanceSourceId: "b2", amountMinor: "1" },
      ],
    },
  ])
    expect(() => normalizeFinancePurchase({ ...input, ...change })).toThrow()
})
test("direct source review requires current authority, Book, supplier, Store, currency and active typed controls", async () => {
  for (const mutate of [
    (s: ReturnType<typeof fixture>["state"]) => {
      s.denied = true
    },
    (s: ReturnType<typeof fixture>["state"]) => {
      s.book.tenantId = "other"
    },
    (s: ReturnType<typeof fixture>["state"]) => {
      s.supplier.bookId = "other"
    },
    (s: ReturnType<typeof fixture>["state"]) => {
      s.store.tenantId = "other"
    },
    (s: ReturnType<typeof fixture>["state"]) => {
      s.store.currencyCode = "USD"
    },
    (s: ReturnType<typeof fixture>["state"]) => {
      s.tenant.currencyCode = "USD"
    },
    (s: ReturnType<typeof fixture>["state"]) => {
      s.book.closedThrough = new Date(input.incurredAt)
    },
  ]) {
    const f = fixture()
    mutate(f.state)
    await expect(
      resolveFinancePurchaseRecordingSource(f.tx, input, f.book),
    ).rejects.toThrow()
    if (f.state.denied)
      expect(f.state.calls).toEqual(["authority-lock", "authority"])
  }
  for (const code of ["1300", "2000"])
    for (const change of ["missing", "archived", "kind", "purpose", "book"]) {
      const f = fixture(),
        a = f.state.accounts.find((a) => a.code === code)!
      if (change === "missing")
        f.state.accounts = f.state.accounts.filter((x) => x !== a)
      else if (change === "archived") a.archivedAt = new Date()
      else if (change === "kind") a.kind = "INCOME"
      else if (change === "purpose") a.purpose = "CASH"
      else a.bookId = "other"
      await expect(
        resolveFinancePurchaseRecordingSource(f.tx, input, f.book),
      ).rejects.toMatchObject({ code: "CONFLICT" })
    }
})
test("review includes payable and exact received-stock value and digests all source labels and provenance", async () => {
  const f = fixture(),
    source = await resolveFinancePurchaseRecordingSource(f.tx, input, f.book)
  const r = await composeFinancePurchaseRecordingReview(
    f.tx,
    input,
    f.book,
    source,
    f.stock,
  )
  expect(r).toMatchObject({
    description: "Received goods",
    reference: "REF",
    totalMinor: "125",
    payableIncreaseMinor: "125",
    stockEffect: "RECEIPT",
    moneyTransfer: "NOT_PERFORMED",
    paymentEffect: "NONE",
    receiptCorrection: "SUPPLIER_RETURN_SOURCE_REQUIRED",
  })
  expect(r.goods[0]!.valuation).toMatchObject({
    status: "KNOWN",
    quantityBefore: "0",
    canonicalEffect: "2.125",
    quantityAfter: "2.125",
    sourceCostMinor: "125",
    valueAfterMinor: "125",
  })
  expect(r.journal).toEqual([
    {
      accountId: "inventory",
      accountName: "Inventory",
      code: "1300",
      debitMinor: "125",
      creditMinor: "0",
    },
    {
      accountId: "payable",
      accountName: "Payable",
      code: "2000",
      debitMinor: "0",
      creditMinor: "125",
    },
  ])
  const digest = financePurchaseRecordingReviewDigest(r)
  for (const mutate of [
    (r: Awaited<ReturnType<typeof composeFinancePurchaseRecordingReview>>) => {
      r.supplierName = "changed"
    },
    (r: Awaited<ReturnType<typeof composeFinancePurchaseRecordingReview>>) => {
      r.storeName = "changed"
    },
    (r: Awaited<ReturnType<typeof composeFinancePurchaseRecordingReview>>) => {
      r.goods[0]!.categories[0]!.name = "changed"
    },
    (r: Awaited<ReturnType<typeof composeFinancePurchaseRecordingReview>>) => {
      r.goods[0]!.stock.revision++
    },
    (r: Awaited<ReturnType<typeof composeFinancePurchaseRecordingReview>>) => {
      r.goods[0]!.valuation.poolSequence = "changed"
    },
    (r: Awaited<ReturnType<typeof composeFinancePurchaseRecordingReview>>) => {
      r.journal[0]!.accountName = "changed"
    },
  ]) {
    const changed = structuredClone(r)
    mutate(changed)
    expect(financePurchaseRecordingReviewDigest(changed)).not.toBe(digest)
  }
  r.goods[0]!.stock.revision = 99
  expect(f.stock.get("balance")!.revision).toBe(3)
  f.stock.get("balance")!.revision++
  await expect(
    composeFinancePurchaseRecordingReview(f.tx, input, f.book, source, f.stock),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})
