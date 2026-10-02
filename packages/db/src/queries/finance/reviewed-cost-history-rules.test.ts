import { describe, expect, test } from "bun:test"
import {
  type ReviewedPhysicalBalance,
  type ReviewedPhysicalMovement,
  auditReviewedCostPhysicalHistory,
} from "./reviewed-cost-history-rules"
import { FinanceError } from "./rules"

type Input = Parameters<typeof auditReviewedCostPhysicalHistory>[0]
const date = new Date("2026-10-01T12:00:00Z")
const store = { id: "store", tenantId: "tenant", currencyCode: "NGN" }
const unit = {
  id: "unit",
  configurationVersionId: "version",
  productId: "product",
  factor: "1",
  stockBehavior: "CANONICAL_SHARED",
}
function balance(ending = "3", count = 2): ReviewedPhysicalBalance {
  return {
    id: "balance",
    tenantId: "tenant",
    storeId: "store",
    store: { ...store },
    productId: "product",
    product: { id: "product", catalogItemId: "item", tenantId: "tenant" },
    variantId: "variant",
    variant: { id: "variant", catalogItemId: "item" },
    inventoryUnitId: "unit",
    unit: { ...unit },
    kind: "SHARED_POOL",
    onHandQuantity: ending,
    revision: 2,
    movementCount: count,
    pool: {
      id: "pool",
      tenantId: "tenant",
      bookId: "book",
      balanceSourceId: "balance",
      quantity: ending,
      valueMinor: null,
      lastSequence: BigInt(count),
      lastMovementCount: BigInt(count),
      lastStockRevision: 2,
      lastCostReviewSnapshotId: null,
    },
  }
}
function movement(
  id: string,
  before: string,
  after: string,
  effect: string,
  sequence: bigint | null,
): ReviewedPhysicalMovement {
  const operation = {
    id: `operation-${id}`,
    tenantId: "tenant",
    storeId: "store",
    store: { ...store },
    type: before === "0" ? "OPENING_STOCK" : "ADJUSTMENT",
    source: "QA_HISTORY_FACT",
    clientOperationId: `command-${id}`,
    payloadHash: "a".repeat(64),
    actorUserId: "actor",
    effectiveAt: new Date(date),
    linkedOperationId: null,
    correctionOfOperationId: null,
  }
  return {
    id,
    balanceSourceId: "balance",
    configurationVersionId: "version",
    enteredInventoryUnitId: "unit",
    enteredQuantity: effect.startsWith("-") ? effect.slice(1) : effect,
    transactionScaleSnapshot: 6,
    unitFactorSnapshot: "1",
    signedCanonicalEffect: effect,
    previousOnHandQuantity: before,
    resultingOnHandQuantity: after,
    reversalOfMovementId: null,
    createdAt: new Date(date),
    unit: { ...unit },
    operation,
    valuation:
      sequence === null
        ? null
        : {
            id: `event-${id}`,
            tenantId: "tenant",
            bookId: "book",
            poolId: "pool",
            balanceSourceId: "balance",
            stockOperationId: operation.id,
            stockMovementId: id,
            sequence,
            sourceKind: "QA_HISTORY_FACT",
            sourceId: operation.id,
            canonicalEffect: effect,
            quantityBefore: before,
            quantityAfter: after,
            sourceCostMinor: null,
            effectiveAt: new Date(date),
          },
  }
}
function fixture(): Input {
  return {
    tenantId: "tenant",
    bookId: "book",
    currencyCode: "NGN",
    bookSequence: 4n,
    through: new Date(date),
    balances: [balance()],
    movements: [
      movement("opening", "0", "4", "4", 1n),
      movement("issue", "4", "3", "-1", 2n),
    ],
  }
}
function first(result: ReturnType<typeof auditReviewedCostPhysicalHistory>) {
  const row = result.balances[0]
  if (!row) throw new Error("Missing fixture history")
  return row
}
function rejected(value: Input) {
  try {
    auditReviewedCostPhysicalHistory(value)
    throw new Error("Expected rejected history")
  } catch (error) {
    expect(error).toBeInstanceOf(FinanceError)
    if (!(error instanceof FinanceError)) throw error
    expect(error.code).toBe("CONFLICT")
  }
}

describe("persisted physical history audit for reviewed original costs", () => {
  test("uses registered sequence rather than IDs, input order or transaction timestamps", () => {
    const value = fixture()
    const opening = value.movements[0]
    const issue = value.movements[1]
    if (!opening || !issue) throw new Error("Missing fixture movement")
    opening.createdAt = new Date(date.getTime() + 100)
    issue.createdAt = new Date(date.getTime() - 100)
    value.movements.reverse()
    const result = auditReviewedCostPhysicalHistory(value)
    expect(first(result).orderedMovementIds).toEqual(["opening", "issue"])
    expect(first(result).physicalQuantityReconciled).toBe(true)
    expect(first(result).issues).toEqual([])
    expect(first(result).impliedBaselineQuantity).toBe("0")
    expect(
      first(result).movements.every(
        (row) => row.valuation?.sourceCostMinor === null,
      ),
    ).toBe(true)
    expect(result.scope).toBe("REQUESTED_PHYSICAL_BALANCES")
    expect(result.requiresCostGraphClosure).toBe(true)
  })
  test("reconstructs unique legacy quantity links without treating unregistered history as known zero", () => {
    const value = fixture()
    for (const row of value.movements) row.valuation = null
    const current = value.balances[0]
    if (current) current.pool = null
    value.movements.reverse()
    const result = first(auditReviewedCostPhysicalHistory(value))
    expect(result.orderedMovementIds).toEqual(["opening", "issue"])
    expect(result.physicalQuantityReconciled).toBe(true)
    expect(result.issues).toEqual([
      "UNREGISTERED_MOVEMENTS",
      "MISSING_VALUATION_POOL",
    ])
  })
  test("exposes an implied legacy baseline without inventing original cost or a source date", () => {
    const value = fixture()
    value.balances = [balance("7", 1)]
    value.movements = [movement("receipt", "5", "7", "2", null)]
    const result = first(auditReviewedCostPhysicalHistory(value))
    expect(result.impliedBaselineQuantity).toBe("5")
    expect(result.orderedMovementIds).toEqual(["receipt"])
    expect(result.issues).toContain("MISSING_ORIGINAL_BASELINE")
  })
  test("keeps nonzero legacy stock with no movement record explicit", () => {
    const value = fixture()
    value.balances = [balance("8", 0)]
    value.movements = []
    const current = value.balances[0]
    if (current) current.pool = null
    const result = first(auditReviewedCostPhysicalHistory(value))
    expect(result.impliedBaselineQuantity).toBe("8")
    expect(result.issues).toEqual([
      "MISSING_ORIGINAL_BASELINE",
      "MISSING_VALUATION_POOL",
    ])
  })
  test("never uses timestamps to choose between ambiguous net-zero legacy paths", () => {
    const value = fixture()
    value.balances = [balance("2", 5)]
    value.movements = [
      movement("initial", "0", "2", "2", null),
      movement("out-a", "2", "1", "-1", null),
      movement("in-a", "1", "2", "1", null),
      movement("out-b", "2", "0", "-2", null),
      movement("in-b", "0", "2", "2", null),
    ]
    const current = value.balances[0]
    if (current) current.pool = null
    const result = first(auditReviewedCostPhysicalHistory(value))
    expect(result.orderedMovementIds).toBeNull()
    expect(result.physicalQuantityReconciled).toBe(false)
    expect(result.issues).toContain("AMBIGUOUS_LEDGER_ORDER")
    expect(result.movements).toHaveLength(5)
  })
  test("detects empty net-zero unregistered movements even when the projection quantity is unchanged", () => {
    const value = fixture()
    value.movements.push(
      movement("out", "3", "2", "-1", null),
      movement("back", "2", "3", "1", null),
    )
    const current = value.balances[0]
    if (current) current.movementCount = 4
    const result = first(auditReviewedCostPhysicalHistory(value))
    expect(result.physicalQuantityReconciled).toBe(true)
    expect(result.issues).toContain("UNREGISTERED_MOVEMENTS")
    expect(result.issues).toContain("STALE_VALUATION_PROJECTION")
    expect(result.orderedMovementIds).toEqual([
      "opening",
      "issue",
      "out",
      "back",
    ])
  })
  test("exposes unexplained quantity changes instead of silently accepting a current snapshot", () => {
    const value = fixture()
    const current = value.balances[0]
    if (current) {
      current.onHandQuantity = "5"
      current.pool = null
    }
    for (const row of value.movements) row.valuation = null
    const result = first(auditReviewedCostPhysicalHistory(value))
    expect(result.orderedMovementIds).toBeNull()
    expect(result.issues).toContain("UNEXPLAINED_QUANTITY_CHANGE")
  })
  test("captures missing sequence and projection history independently of physical quantity reconciliation", () => {
    const value = fixture()
    const issue = value.movements[1]
    if (issue?.valuation) issue.valuation.sequence = 3n
    const result = first(auditReviewedCostPhysicalHistory(value))
    expect(result.physicalQuantityReconciled).toBe(true)
    expect(result.issues).toContain("NON_DENSE_VALUATION_SEQUENCE")
    expect(result.issues).toContain("VALUATION_SEQUENCE_MISMATCH")
  })
  test("converts packaged physical counts with the immutable factor and retains historical versions", () => {
    const value = fixture()
    const current = value.balances[0]
    if (!current) throw new Error("Missing fixture balance")
    current.kind = "PACKAGED_STOCK"
    current.onHandQuantity = "3"
    current.unit = {
      ...unit,
      factor: "12",
      stockBehavior: "PACKAGED_STOCK",
      configurationVersionId: "old-version",
    }
    if (current.pool) current.pool.quantity = "36"
    for (const row of value.movements) {
      row.unit = { ...current.unit }
      row.configurationVersionId = "old-version"
      row.unitFactorSnapshot = "12"
      row.signedCanonicalEffect = row.id === "opening" ? "48" : "-12"
      if (row.valuation) {
        row.valuation.canonicalEffect = row.signedCanonicalEffect
        row.valuation.quantityBefore = row.id === "opening" ? "0" : "48"
        row.valuation.quantityAfter = row.id === "opening" ? "48" : "36"
      }
    }
    const result = first(auditReviewedCostPhysicalHistory(value))
    expect(result.canonicalOnHandQuantity).toBe("36")
    expect(
      result.movements.find((row) => row.id === "issue")?.canonicalBefore,
    ).toBe("48")
    expect(result.issues).toEqual([])
  })
  test("retains exact 18-place effects from fractional packaged units", () => {
    const value = fixture()
    value.balances = [balance("0.000001", 1)]
    value.movements = [
      movement("tiny", "0", "0.000001", "0.000000000000000001", 1n),
    ]
    const current = value.balances[0]
    const row = value.movements[0]
    if (!current || !row) throw new Error("Missing fixture tiny history")
    current.kind = "PACKAGED_STOCK"
    current.unit = {
      ...unit,
      factor: "0.000000000001",
      stockBehavior: "PACKAGED_STOCK",
    }
    if (current.pool) current.pool.quantity = "0.000000000000000001"
    row.enteredQuantity = "0.000001"
    row.unit = { ...current.unit }
    row.unitFactorSnapshot = current.unit.factor
    if (row.valuation) {
      row.valuation.quantityAfter = "0.000000000000000001"
    }
    const result = first(auditReviewedCostPhysicalHistory(value))
    expect(result.canonicalOnHandQuantity).toBe("0.000000000000000001")
    expect(result.issues).toEqual([])
  })
  test("retains a real zero opening but rejects zero quantity as an ordinary movement", () => {
    const value = fixture()
    value.balances = [balance("0", 1)]
    value.movements = [movement("zero", "0", "0", "0", 1n)]
    expect(
      first(auditReviewedCostPhysicalHistory(value)).orderedMovementIds,
    ).toEqual(["zero"])
    const row = value.movements[0]
    if (row) row.operation.type = "ADJUSTMENT"
    rejected(value)
  })
  test("binds physical snapshot identity to revisions, registered amounts, Book sequence and review pointer", () => {
    const value = fixture()
    const before = structuredClone(value)
    const result = auditReviewedCostPhysicalHistory(value)
    expect(value).toEqual(before)
    expect(
      auditReviewedCostPhysicalHistory({
        ...value,
        movements: [...value.movements].reverse(),
      }).physicalSnapshotHash,
    ).toBe(result.physicalSnapshotHash)
    for (const change of [
      (changed: Input) => {
        changed.bookSequence++
      },
      (changed: Input) => {
        const current = changed.balances[0]
        if (current) current.revision++
      },
      (changed: Input) => {
        const current = changed.balances[0]
        if (current?.pool) current.pool.lastCostReviewSnapshotId = "new-review"
      },
      (changed: Input) => {
        const row = changed.movements[0]
        if (row?.valuation) row.valuation.sourceCostMinor = 0n
      },
    ]) {
      const changed = structuredClone(value)
      change(changed)
      expect(
        auditReviewedCostPhysicalHistory(changed).physicalSnapshotHash,
      ).not.toBe(result.physicalSnapshotHash)
    }
  })
  test.each([
    [
      "Tenant",
      (value: Input) => {
        value.tenantId = "foreign"
      },
    ],
    [
      "Book",
      (value: Input) => {
        value.bookId = "foreign"
      },
    ],
    [
      "currency",
      (value: Input) => {
        value.currencyCode = "USD"
      },
    ],
    [
      "foreign Product",
      (value: Input) => {
        const current = value.balances[0]
        if (current) current.product.tenantId = "foreign"
      },
    ],
    [
      "wrong Variant",
      (value: Input) => {
        const current = value.balances[0]
        if (current) current.variant.catalogItemId = "other"
      },
    ],
    [
      "wrong pool",
      (value: Input) => {
        const current = value.balances[0]
        if (current?.pool) current.pool.balanceSourceId = "other"
      },
    ],
    [
      "missing movement",
      (value: Input) => {
        value.movements.pop()
      },
    ],
    [
      "duplicate movement",
      (value: Input) => {
        const row = value.movements[0]
        if (row) value.movements.push(structuredClone(row))
      },
    ],
    [
      "foreign operation",
      (value: Input) => {
        const row = value.movements[0]
        if (row) row.operation.tenantId = "foreign"
      },
    ],
    [
      "future operation",
      (value: Input) => {
        const row = value.movements[0]
        if (row) row.operation.effectiveAt = new Date(date.getTime() + 1)
      },
    ],
    [
      "invalid operation hash",
      (value: Input) => {
        const row = value.movements[0]
        if (row) row.operation.payloadHash = "bad"
      },
    ],
    [
      "wrong unit version",
      (value: Input) => {
        const row = value.movements[0]
        if (row) row.configurationVersionId = "other"
      },
    ],
    [
      "changed factor",
      (value: Input) => {
        const row = value.movements[0]
        if (row) row.unitFactorSnapshot = "12"
      },
    ],
    [
      "quantity precision",
      (value: Input) => {
        const row = value.movements[0]
        if (row) row.enteredQuantity = "4.0000001"
      },
    ],
    [
      "wrong physical effect",
      (value: Input) => {
        const row = value.movements[0]
        if (row) row.signedCanonicalEffect = "3"
      },
    ],
    [
      "wrong entered effect",
      (value: Input) => {
        const row = value.movements[0]
        if (row) row.enteredQuantity = "3"
      },
    ],
    [
      "event scope",
      (value: Input) => {
        const row = value.movements[0]
        if (row?.valuation) row.valuation.bookId = "foreign"
      },
    ],
    [
      "event identity",
      (value: Input) => {
        const row = value.movements[0]
        if (row?.valuation) row.valuation.stockMovementId = "wrong"
      },
    ],
    [
      "event quantity",
      (value: Input) => {
        const row = value.movements[0]
        if (row?.valuation) row.valuation.quantityAfter = "5"
      },
    ],
    [
      "event date",
      (value: Input) => {
        const row = value.movements[0]
        if (row?.valuation)
          row.valuation.effectiveAt = new Date(date.getTime() - 1)
      },
    ],
    [
      "duplicate sequence",
      (value: Input) => {
        const row = value.movements[1]
        if (row?.valuation) row.valuation.sequence = 1n
      },
    ],
    [
      "negative original cost",
      (value: Input) => {
        const row = value.movements[0]
        if (row?.valuation) row.valuation.sourceCostMinor = -1n
      },
    ],
  ])("rejects %s", (_name, change) => {
    const value = fixture()
    change(value)
    rejected(value)
  })
})
