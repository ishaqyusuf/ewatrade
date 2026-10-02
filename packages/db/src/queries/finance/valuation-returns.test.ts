import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  allocateOriginalIssueReturnCost,
  recordProductReturnValuationInTransaction,
} from "./valuation-returns"

const decimal = (value: string) => ({ toFixed: () => value })
const returnAt = new Date("2026-09-15T12:00:00.000Z")
const actorUserId = "actor-1"

function baseFixture(
  options: {
    disposition?: "RESTOCK" | "DAMAGED"
    issueEvent?: Record<string, unknown> | null
    existingCost?: Record<string, unknown> | null
    currentPool?: Record<string, unknown> | null
  } = {},
) {
  const store = { tenantId: "tenant-1", currencyCode: "NGN" }
  const balance = {
    id: "balance-1",
    tenantId: "tenant-1",
    storeId: "store-1",
    store,
    variantId: "variant-1",
    inventoryUnitId: "unit-1",
    kind: "SHARED_POOL",
    revision: 2,
    onHandQuantity: decimal("5"),
    inventoryUnit: { configurationVersionId: "configuration-1" },
  }
  const issueMovement = {
    id: "issue-movement-1",
    balanceSourceId: balance.id,
    configurationVersionId: "configuration-1",
    enteredInventoryUnitId: "unit-1",
    enteredQuantity: decimal("1"),
    reversalOfMovementId: null,
    unitFactorSnapshot: decimal("1"),
    signedCanonicalEffect: decimal("-1"),
    previousOnHandQuantity: decimal("2"),
    resultingOnHandQuantity: decimal("1"),
    balanceSource: balance,
    valuationEvent:
      options.issueEvent === undefined
        ? {
            id: "issue-1",
            tenantId: "tenant-1",
            bookId: "book-1",
            balanceSourceId: balance.id,
            kind: "ISSUE",
            sourceKind: "PRODUCT_FULFILLMENT",
            sourceId: "fulfillment-1",
            stockOperationId: "sale-operation-1",
            stockMovementId: "issue-movement-1",
            canonicalEffect: decimal("-1"),
            quantityBefore: decimal("2"),
            quantityAfter: decimal("1"),
            valueBeforeMinor: BigInt(40),
            valueDeltaMinor: BigInt(-40),
            valueAfterMinor: BigInt(0),
            sourceCostMinor: BigInt(40),
            unknownReason: null,
            effectiveAt: new Date("2026-09-01T12:00:00.000Z"),
            actorUserId,
          }
        : options.issueEvent,
  }
  const fulfillment = {
    id: "fulfillment-1",
    orderLineId: "line-1",
    reservationId: "reservation-1",
    stockOperationId: "sale-operation-1",
    quantity: decimal("1"),
    reservation: {
      id: "reservation-1",
      tenantId: "tenant-1",
      storeId: "store-1",
      commercialOrderLineId: "line-1",
      status: "COMMITTED",
      offeringId: "offering-1",
      balanceSourceId: balance.id,
      configurationVersionId: "configuration-1",
      enteredInventoryUnitId: "unit-1",
      enteredQuantity: decimal("1"),
      unitFactorSnapshot: decimal("1"),
      canonicalQuantity: decimal("1"),
    },
    stockOperation: {
      id: "sale-operation-1",
      tenantId: "tenant-1",
      storeId: "store-1",
      type: "SALE_FULFILLMENT",
      source: "commercial_order",
      actorUserId,
      effectiveAt: new Date("2026-09-01T12:00:00.000Z"),
      movements: [issueMovement],
    },
    returnCostAllocations: [],
  }
  const returnMovement = {
    id: "return-movement-1",
    balanceSourceId: balance.id,
    configurationVersionId: "configuration-1",
    enteredInventoryUnitId: "unit-1",
    enteredQuantity: decimal("1"),
    unitFactorSnapshot: decimal("1"),
    signedCanonicalEffect: decimal("1"),
    reversalOfMovementId: null,
    previousOnHandQuantity: decimal("4"),
    resultingOnHandQuantity: decimal("5"),
    balanceSource: balance,
    valuationEvent: null,
  }
  const returnHistory: Array<Record<string, unknown>> = []
  const productReturn = {
    id: "return-1",
    tenantId: "tenant-1",
    storeId: "store-1",
    orderId: "order-1",
    orderLineId: "line-1",
    quantity: decimal("1"),
    disposition: options.disposition ?? "RESTOCK",
    destinationBalanceSourceId: balance.id,
    stockOperationId: "return-operation-1",
    actorUserId,
    createdAt: returnAt,
    order: {
      id: "order-1",
      tenantId: "tenant-1",
      storeId: "store-1",
      currencyCode: "NGN",
      store,
    },
    orderLine: {
      id: "line-1",
      orderId: "order-1",
      kind: "PRODUCT_UNIT",
      offeringId: "offering-1",
      quantity: decimal("1"),
      snapshot: {
        currencyCode: "NGN",
        offeringId: "offering-1",
        offeringKind: "PRODUCT_UNIT",
        balanceSourceId: balance.id,
        inventoryUnitId: "unit-1",
        configurationVersionId: "configuration-1",
        unitFactor: decimal("1"),
        stockBehavior: "CANONICAL_SHARED",
        variantId: "variant-1",
      },
      productFulfillments: [fulfillment],
      productReturns: returnHistory,
    },
    stockOperation: {
      id: "return-operation-1",
      tenantId: "tenant-1",
      storeId: "store-1",
      type: "RETURN",
      source: "commercial_order_return",
      actorUserId,
      effectiveAt: returnAt,
      movements: [returnMovement],
    },
    financeCost: options.existingCost ?? null,
  }
  productReturn.orderLine.productReturns.push(productReturn)
  const pool =
    options.currentPool === undefined
      ? {
          id: "pool-1",
          quantity: decimal("4"),
          valueMinor: BigInt(200),
          unknownReason: null,
          lastMovementCount: BigInt(1),
          lastSequence: BigInt(2),
          latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
        }
      : options.currentPool
  const state: {
    pool: Record<string, unknown> | null
    event: Record<string, unknown> | null
    header: Record<string, unknown> | null
    allocations: Array<Record<string, unknown>>
  } = {
    pool,
    event: null,
    header: null,
    allocations: [],
  }
  const tx = {
    productReturn: { findFirst: async () => productReturn },
    financeBook: {
      findUnique: async () => ({
        id: "book-1",
        tenantId: "tenant-1",
        currencyCode: "NGN",
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        closedThrough: null,
      }),
    },
    financeProductReturnCost: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.header = {
          id: "return-cost-1",
          ...data,
          allocations: [],
          valuationEvent: null,
        }
        return state.header
      },
    },
    financeProductReturnCostAllocation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.allocations.push(data)
        return data
      },
    },
    financeInventoryPool: {
      findUnique: async () => state.pool,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.pool = { ...state.pool, ...data }
        return state.pool
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.pool = { id: "pool-1", ...data }
        return state.pool
      },
    },
    stockMovement: { count: async () => 2 },
    financeInventoryValuationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.event = data
        return data
      },
    },
  }
  return { tx: tx as unknown as Prisma.TransactionClient, state, productReturn }
}

describe("private original-cost Product return adapter", () => {
  test("allocates partial original cost and assigns the exact residual on final return", () => {
    const first = allocateOriginalIssueReturnCost(
      { quantity: "3", cost: BigInt(101), unknownReason: null },
      "1",
      true,
    )
    expect(first).toEqual({
      after: { quantity: "2", cost: BigInt(67), unknownReason: null },
      allocatedCost: BigInt(34),
    })
    const final = allocateOriginalIssueReturnCost(first.after, "2", true)
    expect(final).toEqual({
      after: { quantity: "0", cost: BigInt(0), unknownReason: null },
      allocatedCost: BigInt(67),
    })
  })

  test("preserves unknown original issue cost as null", () => {
    expect(
      allocateOriginalIssueReturnCost(
        { quantity: "2", cost: null, unknownReason: "MISSING_ISSUE_COST" },
        "1",
        false,
      ),
    ).toEqual({
      after: {
        quantity: "1",
        cost: null,
        unknownReason: "MISSING_ISSUE_COST",
      },
      allocatedCost: null,
    })
  })

  test("stores missing original issue cost as UNKNOWN on the source allocation", async () => {
    const fixture = baseFixture({ disposition: "DAMAGED", issueEvent: null })
    const result = await recordProductReturnValuationInTransaction(fixture.tx, {
      tenantId: "tenant-1",
      productReturnId: "return-1",
    })
    expect(result).toMatchObject({
      sourceCostMinor: null,
      unknownReason: "MISSING_ISSUE_COST",
    })
    expect(fixture.state.allocations).toHaveLength(1)
    expect(fixture.state.allocations[0]).toMatchObject({
      originalIssueId: null,
      sourceCostMinor: null,
      unknownReason: "MISSING_ISSUE_COST",
    })
    expect(fixture.state.event).toBeNull()
  })

  test("legacy prior returns mark later cost untracked without inventing allocations", async () => {
    const fixture = baseFixture({ disposition: "DAMAGED" })
    fixture.productReturn.quantity = decimal("0.5")
    fixture.productReturn.orderLine.productReturns.unshift({
      id: "legacy-return",
      quantity: decimal("0.5"),
      financeCost: null,
      createdAt: new Date("2026-09-14T12:00:00.000Z"),
    })
    const result = await recordProductReturnValuationInTransaction(fixture.tx, {
      tenantId: "tenant-1",
      productReturnId: "return-1",
    })
    expect(result).toMatchObject({
      canonicalQuantity: "0.5",
      sourceCostMinor: null,
      unknownReason: "UNCAPTURED_RETURNS",
    })
    expect(fixture.state.allocations).toHaveLength(0)
    expect(fixture.state.event).toBeNull()
  })

  test("a saved untracked return keeps the next return unknown", async () => {
    const fixture = baseFixture({ disposition: "DAMAGED" })
    fixture.productReturn.quantity = decimal("0.5")
    const legacy = {
      id: "legacy-return",
      tenantId: "tenant-1",
      orderLineId: "line-1",
      quantity: decimal("0.5"),
      createdAt: new Date("2026-09-14T12:00:00.000Z"),
      financeCost: {
        id: "legacy-cost",
        tenantId: "tenant-1",
        bookId: "book-1",
        orderLineId: "line-1",
        productReturnId: "legacy-return",
        canonicalQuantity: decimal("0.5"),
        sourceCostMinor: null,
        unknownReason: "UNCAPTURED_RETURNS",
        allocations: [],
        productReturn: {
          id: "legacy-return",
          tenantId: "tenant-1",
          orderLineId: "line-1",
          quantity: decimal("0.5"),
        },
      },
    }
    fixture.productReturn.orderLine.productReturns.unshift(legacy)
    const result = await recordProductReturnValuationInTransaction(fixture.tx, {
      tenantId: "tenant-1",
      productReturnId: "return-1",
    })
    expect(result).toMatchObject({
      sourceCostMinor: null,
      unknownReason: "UNCAPTURED_RETURNS",
    })
    expect(fixture.state.allocations).toHaveLength(0)
  })

  test("RESTOCK adds original returned cost to a reconciled known destination pool", async () => {
    const fixture = baseFixture()
    const result = await recordProductReturnValuationInTransaction(fixture.tx, {
      tenantId: "tenant-1",
      productReturnId: "return-1",
    })
    expect(fixture.state.header).toMatchObject({
      canonicalQuantity: "1",
      sourceCostMinor: BigInt(40),
      unknownReason: null,
    })
    expect(fixture.state.pool).toMatchObject({
      quantity: "5",
      valueMinor: BigInt(240),
      lastMovementCount: BigInt(2),
    })
    expect(fixture.state.event).toMatchObject({
      kind: "CUSTOMER_RETURN",
      sourceKind: "PRODUCT_RETURN",
      sourceId: "return-1",
      valueBeforeMinor: BigInt(200),
      valueDeltaMinor: BigInt(40),
      valueAfterMinor: BigInt(240),
    })
  })

  test("keeps legacy return replay immutable and does not read current pool state", async () => {
    const saved = {
      id: "saved-cost",
      tenantId: "tenant-1",
      bookId: "book-1",
      orderLineId: "line-1",
      productReturnId: "return-1",
      canonicalQuantity: decimal("1"),
      sourceCostMinor: BigInt(19),
      unknownReason: null,
      allocations: [],
      valuationEvent: null,
    }
    const fixture = baseFixture({ existingCost: saved })
    const result = await recordProductReturnValuationInTransaction(fixture.tx, {
      tenantId: "tenant-1",
      productReturnId: "return-1",
    })
    expect(Object.is(result, saved)).toBe(true)
    expect(fixture.state.pool?.valueMinor).toBe(BigInt(200))
    expect(fixture.state.event).toBeNull()
  })

  test("rejects a fulfillment variant that differs from the sold-unit snapshot", async () => {
    const fixture = baseFixture({ disposition: "DAMAGED" })
    fixture.productReturn.orderLine.snapshot.variantId = "other-variant"
    await expect(
      recordProductReturnValuationInTransaction(fixture.tx, {
        tenantId: "tenant-1",
        productReturnId: "return-1",
      }),
    ).rejects.toThrow("provenance does not match")
  })
})
