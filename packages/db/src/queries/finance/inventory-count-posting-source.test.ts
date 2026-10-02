import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { resolveInventoryCountPostings } from "./inventory-count-posting-source"
import type { FinanceError } from "./rules"

const effectiveAt = new Date("2026-09-30T12:00:00.000Z")
const decimal = (value: string) => ({ toFixed: () => value })

type LineOptions = {
  id: string
  kind?: "SHARED_POOL" | "PACKAGED_STOCK"
  factor?: string
  expected: string
  observed: string
  variance: string
  valueBefore?: bigint | null
  valueAfter?: bigint | null
  valueDelta?: bigint | null
  sourceCost?: bigint | null
  unknownReason?:
    | "MISSING_OPENING_COST"
    | "PRIOR_UNKNOWN_COST"
    | "UNCAPTURED_MOVEMENTS"
    | null
  eventSourceId?: string
  purchaseReceiptId?: string | null
  productReturnCostId?: string | null
}

function fixture(
  lineOptions: LineOptions[],
  options: {
    book?: Record<string, unknown> | null
    zeroLineTenantMismatch?: boolean
  } = {},
) {
  const store = { id: "store-1", tenantId: "tenant-1", currencyCode: "NGN" }
  const accountRows = [
    {
      id: "expense-6000",
      code: "6000",
      kind: "EXPENSE",
      purpose: "OPERATING_EXPENSE",
    },
    { id: "inventory-1300", code: "1300", kind: "ASSET", purpose: "INVENTORY" },
  ]
  const movements = lineOptions
    .filter((line) => line.variance !== "0")
    .map((line) => {
      const index = lineOptions.indexOf(line) + 1
      const factor = line.factor ?? "1"
      const packaged = (line.kind ?? "SHARED_POOL") === "PACKAGED_STOCK"
      const before = packaged
        ? (Number(line.expected) * Number(factor)).toString()
        : line.expected
      const after = packaged
        ? (Number(line.observed) * Number(factor)).toString()
        : line.observed
      const effect = packaged
        ? (Number(line.variance) * Number(factor)).toString()
        : line.variance
      const balance = {
        id: `balance-${line.id}`,
        tenantId: "tenant-1",
        storeId: store.id,
        kind: line.kind ?? "SHARED_POOL",
        inventoryUnitId: `unit-${line.id}`,
        inventoryUnit: {
          id: `unit-${line.id}`,
          configurationVersionId: `config-${line.id}`,
          transactionScale: 0,
          factor: decimal(factor),
        },
      }
      const movementId = `movement-${line.id}`
      const event = {
        id: `event-${line.id}`,
        sequence: BigInt(index),
        tenantId: "tenant-1",
        bookId: "book-1",
        poolId: `pool-${line.id}`,
        balanceSourceId: balance.id,
        pool: {
          id: `pool-${line.id}`,
          tenantId: "tenant-1",
          bookId: "book-1",
          balanceSourceId: balance.id,
        },
        stockOperationId: "operation-1",
        stockMovementId: movementId,
        purchaseReceiptId: line.purchaseReceiptId ?? null,
        productReturnCostId: line.productReturnCostId ?? null,
        kind: "ADJUSTMENT",
        sourceKind: "STOCK_COUNT",
        sourceId: line.eventSourceId ?? "count-1",
        canonicalEffect: decimal(effect),
        quantityBefore: decimal(before),
        quantityAfter: decimal(after),
        valueBeforeMinor: line.valueBefore ?? null,
        valueDeltaMinor: line.valueDelta ?? null,
        valueAfterMinor: line.valueAfter ?? null,
        sourceCostMinor: line.sourceCost ?? null,
        unknownReason: line.unknownReason ?? null,
        effectiveAt,
        actorUserId: "finalizer-1",
      }
      return {
        id: movementId,
        operationId: "operation-1",
        balanceSourceId: balance.id,
        configurationVersionId: `config-${line.id}`,
        enteredInventoryUnitId: balance.inventoryUnitId,
        enteredQuantity: decimal(
          line.variance.startsWith("-")
            ? line.variance.slice(1)
            : line.variance,
        ),
        transactionScaleSnapshot: 0,
        unitFactorSnapshot: decimal(factor),
        signedCanonicalEffect: decimal(effect),
        previousOnHandQuantity: decimal(line.expected),
        resultingOnHandQuantity: decimal(line.observed),
        reversalOfMovementId: null,
        balanceSource: { ...balance, id: balance.id },
        valuationEvent: event,
        index,
      }
    })
  const lines = lineOptions.map((line) => {
    const factor = line.factor ?? "1"
    const balance = {
      id: `balance-${line.id}`,
      tenantId:
        options.zeroLineTenantMismatch && line.variance === "0"
          ? "other-tenant"
          : "tenant-1",
      storeId: store.id,
      kind: line.kind ?? "SHARED_POOL",
      inventoryUnitId: `unit-${line.id}`,
      inventoryUnit: {
        id: `unit-${line.id}`,
        configurationVersionId: `config-${line.id}`,
        transactionScale: 0,
        factor: decimal(factor),
      },
    }
    return {
      id: `line-${line.id}`,
      balanceSourceId: balance.id,
      configurationVersionId: `config-${line.id}`,
      expectedQuantity: decimal(line.expected),
      observedQuantity: decimal(line.observed),
      varianceQuantity: decimal(line.variance),
      balanceSource: balance,
    }
  })
  const count = {
    id: "count-1",
    tenantId: "tenant-1",
    storeId: store.id,
    status: "FINALIZED",
    finalizedAt: effectiveAt,
    finalizedOperationId: "operation-1",
    store,
    finalizedOperation: {
      id: "operation-1",
      tenantId: "tenant-1",
      storeId: store.id,
      type: "COUNT_RECONCILIATION",
      source: "stock_count",
      actorUserId: "finalizer-1",
      effectiveAt,
      store,
      movements,
    },
    lines,
  }
  const book =
    options.book === null
      ? null
      : (options.book ?? {
          id: "book-1",
          tenantId: "tenant-1",
          currencyCode: "NGN",
        })
  const tx = {
    stockCount: { findFirst: async () => count },
    financeBook: { findUnique: async () => book },
    financeAccount: { findMany: async () => accountRows },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    count,
    movements,
  }
}

const source = { tenantId: "tenant-1", stockCountId: "count-1" }

describe("inventory count financial posting source", () => {
  test("posts only known shortage cost from saved count events with deterministic provenance", async () => {
    const setup = fixture([
      {
        id: "known-shortage",
        expected: "5",
        observed: "3",
        variance: "-2",
        valueBefore: BigInt(500),
        valueAfter: BigInt(300),
        valueDelta: BigInt(-200),
        sourceCost: BigInt(200),
      },
      {
        id: "unknown-shortage",
        expected: "2",
        observed: "1",
        variance: "-1",
        unknownReason: "MISSING_OPENING_COST",
      },
      {
        id: "physical-gain",
        expected: "1",
        observed: "2",
        variance: "1",
        valueBefore: BigInt(90),
        unknownReason: "UNCAPTURED_MOVEMENTS",
      },
      {
        id: "no-variance",
        expected: "4",
        observed: "4",
        variance: "0",
      },
    ])

    const result = await resolveInventoryCountPostings(setup.tx, source)
    expect(result?.inputs).toHaveLength(1)
    expect(result?.inputs[0]).toMatchObject({
      tenantId: "tenant-1",
      actorUserId: "finalizer-1",
      bookId: "book-1",
      sourceKind: "INVENTORY_COUNT_SHORTAGE",
      sourceId: "movement-known-shortage",
      effectiveAt,
      storeId: "store-1",
      lines: [
        { accountId: "expense-6000", side: "DEBIT", amountMinor: "200" },
        { accountId: "inventory-1300", side: "CREDIT", amountMinor: "200" },
      ],
    })

    expect(typeof result?.inputs[0]?.clientCommandId).toBe("string")
    const replay = await resolveInventoryCountPostings(setup.tx, source)
    expect(replay?.inputs).toEqual(result?.inputs)
  })

  test("converts package-count snapshots through their saved factor", async () => {
    const setup = fixture([
      {
        id: "packaged",
        kind: "PACKAGED_STOCK",
        factor: "12",
        expected: "4",
        observed: "3",
        variance: "-1",
        valueBefore: BigInt(1200),
        valueAfter: BigInt(900),
        valueDelta: BigInt(-300),
        sourceCost: BigInt(300),
      },
    ])

    const result = await resolveInventoryCountPostings(setup.tx, source)
    expect(result?.inputs[0]?.sourceId).toBe("movement-packaged")
    expect(result?.inputs[0]?.lines[0]?.amountMinor).toBe("300")
  })

  test("rejects altered valuation provenance and arbitrary conserved shortage costs", async () => {
    const provenance = fixture([
      {
        id: "bad-source",
        expected: "5",
        observed: "3",
        variance: "-2",
        valueBefore: BigInt(500),
        valueAfter: BigInt(300),
        valueDelta: BigInt(-200),
        sourceCost: BigInt(200),
        eventSourceId: "another-count",
      },
    ])
    await expect(
      resolveInventoryCountPostings(provenance.tx, source),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<FinanceError>)

    const wrongWeightedCost = fixture([
      {
        id: "bad-cost",
        expected: "5",
        observed: "3",
        variance: "-2",
        valueBefore: BigInt(500),
        valueAfter: BigInt(301),
        valueDelta: BigInt(-199),
        sourceCost: BigInt(199),
      },
    ])
    await expect(
      resolveInventoryCountPostings(wrongWeightedCost.tx, source),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<FinanceError>)
  })

  test("rejects valuation events linked to receipt or return sources", async () => {
    for (const overlap of [
      { purchaseReceiptId: "receipt-1" },
      { productReturnCostId: "return-cost-1" },
    ]) {
      const setup = fixture([
        {
          id: "overlap",
          expected: "2",
          observed: "1",
          variance: "-1",
          valueBefore: BigInt(200),
          valueAfter: BigInt(100),
          valueDelta: BigInt(-100),
          sourceCost: BigInt(100),
          ...overlap,
        },
      ])
      await expect(
        resolveInventoryCountPostings(setup.tx, source),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      } satisfies Partial<FinanceError>)
    }
  })

  test("rejects unsafe unknown values, known gains, and out-of-scope zero lines", async () => {
    const unknownOverflow = fixture([
      {
        id: "unknown-overflow",
        expected: "1",
        observed: "2",
        variance: "1",
        valueBefore: BigInt("9223372036854775808"),
        unknownReason: "UNCAPTURED_MOVEMENTS",
      },
    ])
    await expect(
      resolveInventoryCountPostings(unknownOverflow.tx, source),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<FinanceError>)

    const knownGain = fixture([
      {
        id: "known-gain",
        expected: "1",
        observed: "2",
        variance: "1",
        valueBefore: BigInt(100),
        valueDelta: BigInt(50),
        valueAfter: BigInt(150),
        sourceCost: BigInt(50),
      },
    ])
    await expect(
      resolveInventoryCountPostings(knownGain.tx, source),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<FinanceError>)

    const badZeroLineScope = fixture(
      [
        {
          id: "zero-out-of-scope",
          expected: "1",
          observed: "1",
          variance: "0",
        },
      ],
      { zeroLineTenantMismatch: true },
    )
    await expect(
      resolveInventoryCountPostings(badZeroLineScope.tx, source),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<FinanceError>)
  })

  test("returns null when the Store has no financial Book", async () => {
    const setup = fixture(
      [
        {
          id: "known",
          expected: "2",
          observed: "1",
          variance: "-1",
          valueBefore: BigInt(200),
          valueAfter: BigInt(100),
          valueDelta: BigInt(-100),
          sourceCost: BigInt(100),
        },
      ],
      { book: null },
    )
    expect(await resolveInventoryCountPostings(setup.tx, source)).toBeNull()
  })
})
