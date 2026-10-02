import { describe, expect, test } from "bun:test"
import { auditReviewedCostPhysicalHistory } from "./reviewed-cost-history-rules"
import { assertReviewedCostOwnerBindings } from "./reviewed-cost-owner-bindings"

type Owners = Parameters<typeof assertReviewedCostOwnerBindings>[1]
const at = new Date("2026-02-01T00:00:00Z")
function fixture() {
  const store = { id: "store", tenantId: "tenant", currencyCode: "NGN" }
  const unit = {
    id: "unit",
    configurationVersionId: "version",
    productId: "product",
    factor: "1",
    stockBehavior: "CANONICAL_SHARED",
  }
  const operation = {
    id: "operation",
    tenantId: "tenant",
    storeId: "store",
    store,
    type: "OPENING_STOCK" as const,
    source: "catalog_setup",
    clientOperationId: "receipt:opening-stock",
    payloadHash: "a".repeat(64),
    actorUserId: "actor",
    effectiveAt: at,
    linkedOperationId: null,
    correctionOfOperationId: null,
  }
  const movement = {
    id: "movement",
    balanceSourceId: "balance",
    configurationVersionId: "version",
    enteredInventoryUnitId: "unit",
    enteredQuantity: "4",
    transactionScaleSnapshot: 3,
    unitFactorSnapshot: "1",
    signedCanonicalEffect: "4",
    previousOnHandQuantity: "0",
    resultingOnHandQuantity: "4",
    reversalOfMovementId: null,
    createdAt: at,
    valuation: {
      id: "event",
      tenantId: "tenant",
      bookId: "book",
      poolId: "pool",
      balanceSourceId: "balance",
      stockOperationId: "operation",
      stockMovementId: "movement",
      sequence: 1n,
      sourceKind: "CATALOG_OPENING",
      sourceId: "receipt",
      canonicalEffect: "4",
      quantityBefore: "0",
      quantityAfter: "4",
      sourceCostMinor: null,
      effectiveAt: at,
    },
  }
  const physical = auditReviewedCostPhysicalHistory({
    tenantId: "tenant",
    bookId: "book",
    currencyCode: "NGN",
    bookSequence: 0n,
    through: new Date("2026-02-02T00:00:00Z"),
    balances: [
      {
        id: "balance",
        tenantId: "tenant",
        storeId: "store",
        store,
        productId: "product",
        product: { id: "product", catalogItemId: "item", tenantId: "tenant" },
        variantId: "variant",
        variant: { id: "variant", catalogItemId: "item" },
        inventoryUnitId: "unit",
        unit,
        kind: "SHARED_POOL",
        onHandQuantity: "4",
        revision: 0,
        movementCount: 1,
        pool: {
          id: "pool",
          tenantId: "tenant",
          bookId: "book",
          balanceSourceId: "balance",
          quantity: "4",
          valueMinor: null,
          lastSequence: 1n,
          lastMovementCount: 1n,
          lastStockRevision: 0,
          lastCostReviewSnapshotId: null,
        },
      },
    ],
    movements: [{ ...movement, unit, operation }],
  })
  const owners: Owners = {
    operationBindings: [{ ...operation, store: { ...store } }],
    movementBindings: [
      {
        ...movement,
        operationId: operation.id,
        valuation: { ...movement.valuation },
      },
    ],
  }
  return { physical, owners }
}
function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) throw new Error("Missing binding fixture row")
  return row
}

describe("actual owning source to physical binding", () => {
  test("requires the same original scope, operation, physical movement and saved cost", () => {
    const input = fixture()
    assertReviewedCostOwnerBindings(input.physical, input.owners)
    expect(first(input.physical.balances).issues).toEqual([])
    expect(
      first(input.owners.movementBindings).valuation?.sourceCostMinor,
    ).toBeNull()
  })
  const cases: Array<[string, (input: ReturnType<typeof fixture>) => void]> = [
    [
      "missing operation",
      ({ owners }) => {
        owners.operationBindings = []
      },
    ],
    [
      "duplicate operation",
      ({ owners }) => {
        owners.operationBindings.push(first(owners.operationBindings))
      },
    ],
    [
      "extra operation",
      ({ owners }) => {
        owners.operationBindings.push({
          ...first(owners.operationBindings),
          id: "other",
        })
      },
    ],
    [
      "missing movement",
      ({ owners }) => {
        owners.movementBindings = []
      },
    ],
    [
      "duplicate movement",
      ({ owners }) => {
        owners.movementBindings.push(first(owners.movementBindings))
      },
    ],
    [
      "wrong movement owner",
      ({ owners }) => {
        first(owners.movementBindings).operationId = "other"
      },
    ],
    [
      "wrong movement identity",
      ({ owners }) => {
        first(owners.movementBindings).id = "other"
      },
    ],
    [
      "different actor",
      ({ owners }) => {
        first(owners.operationBindings).actorUserId = "other"
      },
    ],
    [
      "different payload",
      ({ owners }) => {
        first(owners.operationBindings).payloadHash = "b".repeat(64)
      },
    ],
    [
      "different operation date",
      ({ owners }) => {
        first(owners.operationBindings).effectiveAt = new Date(
          "2026-02-02T00:00:00Z",
        )
      },
    ],
    [
      "different currency",
      ({ owners }) => {
        first(owners.operationBindings).store.currencyCode = "USD"
      },
    ],
    [
      "different quantity",
      ({ owners }) => {
        first(owners.movementBindings).enteredQuantity = "3"
      },
    ],
    [
      "different unit factor",
      ({ owners }) => {
        first(owners.movementBindings).unitFactorSnapshot = "2"
      },
    ],
    [
      "different configuration",
      ({ owners }) => {
        first(owners.movementBindings).configurationVersionId = "other"
      },
    ],
    [
      "different physical ending",
      ({ owners }) => {
        first(owners.movementBindings).resultingOnHandQuantity = "3"
      },
    ],
    [
      "missing event",
      ({ owners }) => {
        first(owners.movementBindings).valuation = null
      },
    ],
    [
      "different event Book",
      ({ owners }) => {
        const event = first(owners.movementBindings).valuation
        if (event) event.bookId = "other"
      },
    ],
    [
      "different original owner",
      ({ owners }) => {
        const event = first(owners.movementBindings).valuation
        if (event) event.sourceId = "other"
      },
    ],
    [
      "unknown changed to zero",
      ({ owners }) => {
        const event = first(owners.movementBindings).valuation
        if (event) event.sourceCostMinor = 0n
      },
    ],
    [
      "different sequence",
      ({ owners }) => {
        const event = first(owners.movementBindings).valuation
        if (event) event.sequence = 2n
      },
    ],
  ]
  for (const [name, mutate] of cases)
    test(`rejects ${name}`, () => {
      const input = fixture()
      mutate(input)
      expect(() =>
        assertReviewedCostOwnerBindings(input.physical, input.owners),
      ).toThrow()
    })
})
