import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  purchaseReceiptReviewDigest,
  recognizeReviewedFinancePurchaseReceiptInTransaction,
} from "./purchase-recognition"
import { getFinancePurchaseReceiptReview } from "./purchase-receipt-review"
const decimal = (v: string) => ({ toFixed: () => v })
const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  recognitionId: "agreement",
  stage: "RECEIPT" as const,
  reference: " Physical delivery ",
  effectiveAt: new Date("2026-09-03T12:00:00.123Z"),
}
function fixture() {
  const cost = {
    id: "cost-line",
    bookId: "book",
    billId: "cost",
    position: 0,
    accountId: "inventory",
    description: "Original flour",
    amountMinor: 1100n,
  }
  const agreedAt = new Date("2026-09-01")
  const document = {
    id: "agreement",
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
      totalMinor: 1100n,
      payeeName: "ACME",
      description: "Agreed flour",
      lines: [cost],
    },
    lines: [
      {
        id: "line",
        tenantId: "tenant",
        bookId: "book",
        recognitionId: "agreement",
        costBillId: "cost",
        costBillLineId: "cost-line",
        costBillLine: cost,
        balanceSourceId: "balance",
        configurationVersionId: "config",
        enteredInventoryUnitId: "unit",
        enteredQuantity: decimal("2.125"),
        enteredInventoryUnit: { name: "bag" },
        categories: [{ name: "purchase" }] as Prisma.JsonValue,
      },
    ],
    events: [],
  }
  const unit = {
    id: "unit",
    name: "bag",
    factor: decimal("1"),
    transactionScale: 3,
    stockBehavior: "CANONICAL_SHARED",
    configurationVersionId: "config",
    configurationVersion: { status: "CURRENT" },
  }
  const balance = {
    id: "balance",
    tenantId: "tenant",
    storeId: "store",
    kind: "SHARED_POOL",
    custodyType: "STORE",
    revision: 3,
    onHandQuantity: decimal("0"),
    reservedQuantity: decimal("0"),
    inventoryUnitId: "unit",
    inventoryUnit: unit,
    product: { catalogItemId: "item" },
    variant: { name: "Default" },
    store: { currencyCode: "NGN" },
  }
  const state = {
    allowed: true,
    closed: false,
    movementCount: 0,
    categories: [
      {
        id: 7,
        tenantId: "tenant",
        name: "Purchase",
        normalizedName: "purchase",
      },
    ],
    pools: [] as Array<Record<string, unknown>>,
  }
  const book = {
    id: "book",
    currencyCode: "NGN",
    startsAt: new Date("2026-01-01"),
    closedThrough: null as Date | null,
  }
  const tx = {
    $queryRaw: async () => [],
    membership: {
      findFirst: async () =>
        state.allowed
          ? { tenant: { isActive: true, currencyCode: "NGN" } }
          : null,
    },
    financeBook: {
      findFirst: async () => ({
        ...book,
        closedThrough: state.closed ? new Date("2026-09-04") : null,
      }),
      findUniqueOrThrow: async () => book,
    },
    financePurchaseRecognition: { findFirst: async () => document },
    financeAccount: {
      findUnique: async ({
        where,
      }: { where: { bookId_code: { code: string } } }) =>
        where.bookId_code.code === "1300"
          ? {
              id: "inventory",
              bookId: "book",
              code: "1300",
              name: "Inventory",
              kind: "ASSET",
              purpose: "INVENTORY",
              archivedAt: null,
            }
          : null,
      upsert: async () => {
        throw Error("Review wrote an account")
      },
    },
    store: {
      findFirst: async () => ({ id: "store" }),
      findFirstOrThrow: async () => ({ id: "store", name: "Main" }),
    },
    financeInventoryPool: { findMany: async () => state.pools },
    stockMovement: {
      groupBy: async () =>
        state.movementCount
          ? [
              {
                balanceSourceId: "balance",
                _count: { _all: state.movementCount },
              },
            ]
          : [],
    },
    stockOperationCategoryName: {
      findMany: async (args: unknown) => {
        expect(args).toMatchObject({ where: { tenantId: "tenant" }, take: 101 })
        return state.categories
      },
    },
    stockBalanceSource: { findFirst: async () => balance },
    inventoryUnit: {
      findFirst: async () => unit,
      findMany: async () => [{ name: "bag" }],
    },
    catalogItem: { findUniqueOrThrow: async () => ({ name: "Flour" }) },
  } as unknown as Prisma.TransactionClient
  return { tx, document, unit, balance, state }
}
test("read-only whole receipt derives original revisions, exact stock and known cost without payable/payment", async () => {
  const f = fixture()
  const review = await getFinancePurchaseReceiptReview(f.tx, input)
  expect(review).toMatchObject({
    stage: "RECEIPT",
    reference: "Physical delivery",
    payableIncreaseMinor: "0",
    invoiceBillWillBeCreated: false,
    stockEffect: "RECEIPT",
    moneyTransfer: "NOT_PERFORMED",
    receipts: [{ lineId: "line", expectedBalanceRevision: 3 }],
    debit: { code: "1300", willCreate: false },
    credit: { code: "2050", willCreate: true },
    goods: [
      {
        lineId: "line",
        enteredQuantity: "2.125",
        categories: [
          { categoryNameId: 7, name: "Purchase", willCreate: false },
        ],
        stock: {
          before: "0",
          after: "2.125",
          reserved: "0",
          availableAfter: "2.125",
          revision: 3,
        },
        valuation: {
          status: "KNOWN",
          quantityBefore: "0",
          quantityAfter: "2.125",
          sourceCostMinor: "1100",
          valueBeforeMinor: "0",
          valueAfterMinor: "1100",
          observedMovementCount: 0,
        },
      },
    ],
  })
})
test("unknown opening and net-zero gap remain distinct from the exact acquisition cost", async () => {
  const gap = fixture()
  gap.state.movementCount = 2
  expect(
    (await getFinancePurchaseReceiptReview(gap.tx, input)).goods[0]?.valuation,
  ).toMatchObject({
    status: "UNKNOWN",
    sourceCostMinor: "1100",
    valueAfterMinor: null,
    unknownReason: "UNCAPTURED_MOVEMENTS",
  })
  const opening = fixture()
  opening.balance.onHandQuantity = decimal("5")
  expect(
    (await getFinancePurchaseReceiptReview(opening.tx, input)).goods[0]
      ?.valuation,
  ).toMatchObject({
    status: "UNKNOWN",
    quantityAfter: "7.125",
    unknownReason: "MISSING_OPENING_COST",
  })
})
test("packaged receipt distinguishes packs from canonical pool quantity and value", async () => {
  const f = fixture()
  f.balance.kind = "PACKAGED_STOCK"
  f.unit.stockBehavior = "PACKAGED_STOCK"
  f.unit.factor = decimal("12")
  f.balance.onHandQuantity = decimal("2")
  expect(
    (await getFinancePurchaseReceiptReview(f.tx, input)).goods[0],
  ).toMatchObject({
    stock: {
      before: "2",
      after: "4.125",
      canonicalQuantity: "25.5",
      canonicalBefore: "24",
    },
    valuation: {
      quantityBefore: "24",
      canonicalEffect: "25.5",
      quantityAfter: "49.5",
      status: "UNKNOWN",
    },
  })
})
test("review describes new categories without creating them and refuses missing original ID categories", async () => {
  const f = fixture()
  f.state.categories = []
  expect(
    (await getFinancePurchaseReceiptReview(f.tx, input)).goods[0]?.categories,
  ).toEqual([{ categoryNameId: null, name: "purchase", willCreate: true }])
  f.document.lines[0]!.categories = [{ categoryNameId: 99 }]
  await expect(
    getFinancePurchaseReceiptReview(f.tx, input),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})
test("authority, cutoff, retired units, custody, exact confirmations and revision bounds refuse", async () => {
  const denied = fixture()
  denied.state.allowed = false
  await expect(
    getFinancePurchaseReceiptReview(denied.tx, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  const closed = fixture()
  closed.state.closed = true
  await expect(
    getFinancePurchaseReceiptReview(closed.tx, input),
  ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
  const stale = fixture()
  stale.unit.configurationVersion.status = "RETIRED"
  await expect(
    getFinancePurchaseReceiptReview(stale.tx, input),
  ).rejects.toBeDefined()
  const custody = fixture()
  custody.balance.custodyType = "TRANSIT"
  await expect(
    getFinancePurchaseReceiptReview(custody.tx, input),
  ).rejects.toBeDefined()
  for (const receipts of [
    [],
    [{ lineId: "other", expectedBalanceRevision: 3 }],
    [{ lineId: "line", expectedBalanceRevision: 2 }],
  ])
    await expect(
      getFinancePurchaseReceiptReview(fixture().tx, { ...input, receipts }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(
    (
      await getFinancePurchaseReceiptReview(fixture().tx, {
        ...input,
        receipts: [{ lineId: "line", expectedBalanceRevision: 3 }],
      })
    ).receipts,
  ).toEqual([{ lineId: "line", expectedBalanceRevision: 3 }])
  const limit = fixture()
  limit.balance.revision = 2147483647
  await expect(
    getFinancePurchaseReceiptReview(limit.tx, input),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})

test("receipt fingerprint changes with actual stock, valuation or source facts; malformed approval stops before reads", async () => {
  const f = fixture()
  const review = await getFinancePurchaseReceiptReview(f.tx, input)
  const digest = purchaseReceiptReviewDigest(review)
  expect(digest).toMatch(/^[a-f0-9]{64}$/)
  for (const mutate of [
    () => {
      f.balance.revision++
    },
    () => {
      f.state.movementCount++
    },
    () => {
      f.document.costBill.payeeName = "Changed supplier label"
    },
    () => {
      f.state.categories[0]!.name = "Changed category label"
    },
  ]) {
    mutate()
    expect(
      purchaseReceiptReviewDigest(
        await getFinancePurchaseReceiptReview(f.tx, input),
      ),
    ).not.toBe(digest)
  }
  await expect(
    recognizeReviewedFinancePurchaseReceiptInTransaction(
      {} as Prisma.TransactionClient,
      {
        tenantId: "tenant",
        actorUserId: "owner",
        bookId: "book",
        recognitionId: "agreement",
        effectiveAt: input.effectiveAt,
        reference: input.reference,
        clientCommandId: "confirmation",
        expectedReviewDigest: "unreviewed",
      },
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})
