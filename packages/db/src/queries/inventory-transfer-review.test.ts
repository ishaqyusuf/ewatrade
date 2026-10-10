import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import {
  getStockTransferReview,
  getStockTransferLockScope,
  previewStockTransferTransition,
} from "./inventory-transfer-review"
const decimal = (text: string) => ({ toFixed: () => text })
function fixture() {
  const base = {
    tenantId: "tenant",
    productId: "product",
    variantId: "variant",
    inventoryUnitId: "unit",
    kind: "PACKAGED_STOCK",
    revision: 1,
    reservedQuantity: decimal("0"),
  }
  const source = {
    ...base,
    id: "source",
    storeId: "a",
    custodyType: "STORE",
    onHandQuantity: decimal("5"),
  }
  const transit = {
    ...base,
    id: "transit",
    storeId: "a",
    custodyType: "TRANSIT",
    custodyReferenceId: "transfer",
    parentBalanceSourceId: "source",
    onHandQuantity: decimal("10"),
  }
  const destination = {
    ...source,
    id: "destination",
    storeId: "b",
    onHandQuantity: decimal("2"),
    reservedQuantity: decimal("1"),
  }
  const row = {
    id: "transfer",
    createdAt: new Date("2026-10-10T00:00:00Z"),
    tenantId: "tenant",
    status: "IN_TRANSIT",
    sourceStoreId: "a",
    targetStoreId: "b",
    sourceBalanceSourceId: "source",
    transitBalanceSourceId: "transit",
    sourceBalanceSource: source,
    transitBalanceSource: transit,
    inventoryUnitId: "unit",
    configurationVersionId: "version",
    enteredQuantity: decimal("10"),
    canonicalQuantity: decimal("120"),
    stockBehaviorSnapshot: "PACKAGED_STOCK",
    unitFactorSnapshot: decimal("12"),
    inventoryUnit: {
      id: "unit",
      name: "crate",
      stockBehavior: "PACKAGED_STOCK",
      factor: decimal("12"),
      configurationVersionId: "version",
      transactionScale: 2,
    },
    sourceStore: {
      id: "a",
      tenantId: "tenant",
      name: "Source",
      currencyCode: "NGN",
    },
    targetStore: {
      id: "b",
      tenantId: "tenant",
      name: "Destination",
      currencyCode: "NGN",
    },
    acknowledgments: [] as Array<Record<string, unknown>>,
  }
  let query: unknown
  const tx = {
    stockTransfer: {
      findFirst: async (args: unknown) => {
        query = args
        return row
      },
    },
    catalogProduct: {
      findFirst: async () => ({
        catalogItemId: "item",
        catalogItem: { name: "Eggs" },
      }),
    },
    sellableVariant: { findFirst: async () => ({ name: "Large" }) },
    stockBalanceSource: { findFirst: async () => destination },
  } as unknown as Prisma.TransactionClient
  return { tx, row, query: () => query }
}
const scope = {
  tenantId: "tenant",
  storeId: "b",
  transferId: "transfer",
  allowedStoreIds: ["a", "b"],
}

test("partial receipt preview preserves dispatch and shows remaining transit and exact destination increase", async () => {
  const f = fixture()
  const p = await previewStockTransferTransition(f.tx, {
    ...scope,
    quantity: "3.25",
    transition: "receive",
  })
  expect(p.dispatchedQuantity).toBe("10")
  expect(p.plan).toMatchObject({
    remainingBefore: "10",
    remainingAfter: "6.75",
    status: "IN_TRANSIT",
  })
  expect(p.canonicalQuantity).toBe("39")
  expect([p.targetBefore, p.targetAfter, p.targetReserved]).toEqual([
    "2",
    "5.25",
    "1",
  ])
  expect(f.query()).toMatchObject({
    where: {
      tenantId: "tenant",
      sourceStoreId: { in: ["a", "b"] },
      targetStoreId: { in: ["a", "b"] },
    },
  })
})

test("cancel preview returns only remaining transit after previous receipt", async () => {
  const f = fixture()
  f.row.transitBalanceSource.onHandQuantity = decimal("6.75")
  const p = await previewStockTransferTransition(f.tx, {
    ...scope,
    storeId: "a",
    transition: "cancel",
  })
  expect(p.plan.quantity).toBe("6.75")
  expect(p.targetAfter).toBe("11.75")
  expect(p.plan.status).toBe("CANCELLED")
})

test("scope loss, changed unit meaning and excessive receipt refuse review", async () => {
  const f = fixture()
  await expect(
    getStockTransferReview(f.tx, { ...scope, allowedStoreIds: ["b"] }),
  ).rejects.toThrow("scope")
  await expect(
    previewStockTransferTransition(f.tx, {
      ...scope,
      quantity: "11",
      transition: "receive",
    }),
  ).rejects.toThrow("exceeds")
  f.row.transitBalanceSource.tenantId = "foreign"
  await expect(getStockTransferReview(f.tx, scope)).rejects.toThrow("scope")
  f.row.transitBalanceSource.tenantId = "tenant"
  f.row.inventoryUnit.factor = decimal("10")
  await expect(getStockTransferReview(f.tx, scope)).rejects.toThrow("meaning")
})

test("retains acknowledgment evidence and labels bounded history", async () => {
  const f = fixture()
  f.row.acknowledgments = Array.from({ length: 101 }, (_, index) => ({
    id: `ack-${index}`,
    tenantId: "tenant",
    transferId: "transfer",
    operationId: `operation-${index}`,
    kind: "RECEIVE",
    acknowledgedByUserId: "receiver",
    quantity: decimal("1"),
    remainingBefore: decimal("10"),
    remainingAfter: decimal("9"),
    reason: "Counted delivery",
    effectiveAt: new Date("2026-10-10T10:00:00Z"),
  }))
  const review = await getStockTransferReview(f.tx, scope)
  expect(review.acknowledgmentHistoryLimited).toBe(true)
  expect(review.acknowledgments).toHaveLength(100)
  expect(review.acknowledgments[0]).toMatchObject({
    operationId: "operation-0",
    quantity: "1",
    remainingAfter: "9",
    reason: "Counted delivery",
  })
  f.row.acknowledgments[0]!.tenantId = "foreign"
  await expect(getStockTransferReview(f.tx, scope)).rejects.toThrow(
    "acknowledgment scope",
  )
})

test("reserved transit is protected during review", async () => {
  const f = fixture()
  f.row.transitBalanceSource.reservedQuantity = decimal("2")
  await expect(
    previewStockTransferTransition(f.tx, {
      ...scope,
      quantity: "9",
      transition: "receive",
    }),
  ).rejects.toThrow("reserved transit")
})

import { previewStockTransferDispatch } from "./inventory-transfer-review"
function dispatchFixture() {
  const f = fixture()
  const source = {
    ...f.row.sourceBalanceSource,
    custodyReferenceId: "",
    inventoryUnit: f.row.inventoryUnit,
    store: f.row.sourceStore,
    product: {
      catalogItemId: "item",
      catalogItem: { name: "Eggs", tenantId: "tenant" },
    },
    variant: { name: "Large", catalogItemId: "item" },
  }
  Object.assign(f.tx, {
    stockBalanceSource: { findFirst: async () => source },
    store: { findFirst: async () => f.row.targetStore },
  })
  return { ...f, source }
}
const dispatchScope = {
  tenantId: "tenant",
  storeId: "a",
  allowedStoreIds: ["a", "b"],
  sourceBalanceSourceId: "source",
  targetStoreId: "b",
  quantity: "1.25",
}

test("dispatch review projects only source-to-transit movement with original factor", async () => {
  const f = dispatchFixture()
  const p = await previewStockTransferDispatch(f.tx, dispatchScope)
  expect([p.before, p.after, p.inTransitAfter]).toEqual(["5", "3.75", "1.25"])
  expect(p.canonicalQuantity).toBe("15")
  expect(p.targetStore.id).toBe("b")
  expect(p.revision).toBe(1)
})

test("dispatch refuses same/forbidden Store, reserved stock and wrong custody", async () => {
  const f = dispatchFixture()
  await expect(
    previewStockTransferDispatch(f.tx, {
      ...dispatchScope,
      targetStoreId: "a",
    }),
  ).rejects.toThrow("two accessible")
  await expect(
    previewStockTransferDispatch(f.tx, {
      ...dispatchScope,
      allowedStoreIds: ["a"],
    }),
  ).rejects.toThrow("two accessible")
  f.source.reservedQuantity = decimal("4")
  await expect(
    previewStockTransferDispatch(f.tx, dispatchScope),
  ).rejects.toThrow("reserved")
  f.source.custodyType = "STAFF"
  await expect(
    previewStockTransferDispatch(f.tx, dispatchScope),
  ).rejects.toThrow("unavailable")
})


test("confirmation identity lookup stays tenant scoped and refuses lost Store scope", async () => {
  const f = fixture()
  expect(await getStockTransferLockScope(f.tx, scope)).toEqual({
    tenantId: "tenant", transferId: "transfer", sourceStoreId: "a", targetStoreId: "b",
    balanceSourceIds: ["source", "transit", "destination"],
  })
  expect(f.query()).toMatchObject({ where: {
    id: "transfer", tenantId: "tenant", sourceStoreId: { in: ["a", "b"] }, targetStoreId: { in: ["a", "b"] },
    OR: [{ sourceStoreId: "b" }, { targetStoreId: "b" }],
  } })
  await expect(getStockTransferLockScope(f.tx, { ...scope, allowedStoreIds: ["b"] })).rejects.toThrow("Transfer not found")
  await expect(getStockTransferLockScope(f.tx, { ...scope, storeId: "other" })).rejects.toThrow("Transfer not found")
  f.row.tenantId = "foreign"
  await expect(getStockTransferLockScope(f.tx, scope)).rejects.toThrow("Transfer not found")
})
