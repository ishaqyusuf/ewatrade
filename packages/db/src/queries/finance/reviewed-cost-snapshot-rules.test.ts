import { describe, expect, test } from "bun:test"
import { auditReviewedCostPhysicalHistory } from "./reviewed-cost-history-rules"
import { assertReviewedCostOrderLockScope } from "./reviewed-cost-return-rules"
import {
  assertUnchangedReviewedCostDiscovery,
  auditReviewedCostConnectedSnapshot,
} from "./reviewed-cost-snapshot-rules"

type Input = Parameters<typeof auditReviewedCostConnectedSnapshot>[0]
const scope = {
  tenantId: "tenant",
  bookId: "book",
  currencyCode: "NGN",
  bookSequence: 0n,
}
const through = new Date("2026-10-02T00:00:00Z")
function first<T>(values: T[]): T {
  const value = values[0]
  if (value === undefined) throw new Error("Missing snapshot fixture row")
  return value
}
function fixture(): Input {
  const discovery: Input["discovery"] = {
    ...scope,
    rootBalanceSourceIds: ["balance"],
    balanceSourceIds: ["balance"],
    movementIds: [],
    operationIds: [],
    transferIds: [],
    orderLineIds: [],
    productReturnIds: [],
    reviewAllocationIds: [],
    sourceDiscoveryHash: "discovery",
    requiresOwningSourceProof: true,
    requiresMonetaryProof: true,
  }
  const physical = auditReviewedCostPhysicalHistory({
    ...scope,
    through,
    movements: [],
    balances: [
      {
        id: "balance",
        tenantId: "tenant",
        storeId: "store",
        store: { id: "store", tenantId: "tenant", currencyCode: "NGN" },
        productId: "product",
        product: { id: "product", catalogItemId: "item", tenantId: "tenant" },
        variantId: "variant",
        variant: { id: "variant", catalogItemId: "item" },
        inventoryUnitId: "unit",
        unit: {
          id: "unit",
          configurationVersionId: "version",
          productId: "product",
          factor: "1",
          stockBehavior: "CANONICAL_SHARED",
        },
        kind: "SHARED_POOL",
        onHandQuantity: "0",
        revision: 0,
        movementCount: 0,
        pool: null,
      },
    ],
  })
  const returns: Input["returns"] = {
    snapshot: {
      ...scope,
      startsAt: new Date("2026-01-01T00:00:00Z"),
      closedThrough: null,
      lines: [],
      fulfillments: [],
      returns: [],
      budgets: [],
    },
    sourceSnapshotHash: "returns",
    issues: [],
    returns: [],
    allocations: [],
    requiresPhysicalHistoryProof: true,
    requiresMonetaryProof: true,
    requiresPostedJournalProof: true,
  }
  return {
    discovery,
    physical,
    returns,
    revalidatedDiscovery: structuredClone(discovery),
    revalidatedReturns: structuredClone(returns),
  }
}
function changeBothReturns(
  input: Input,
  mutate: (value: Input["returns"]) => void,
) {
  mutate(input.returns)
  input.revalidatedReturns = structuredClone(input.returns)
}

describe("connected reviewed history snapshot", () => {
  test("rejects count-document scope expansion before appending any stock locks", () => {
    const input = fixture()
    const changed = {
      ...input.discovery,
      sourceDocumentReferences: [{ kind: "COUNT_LINE", id: "new-zero-line" }],
    }
    expect(() =>
      assertUnchangedReviewedCostDiscovery(input.discovery, changed),
    ).toThrow("discovery changed")
  })
  test("retains exactly the original Order lock scope independent of input order", () => {
    expect(() =>
      assertReviewedCostOrderLockScope(["B", "A"], ["A", "B"]),
    ).not.toThrow()
    expect(() => assertReviewedCostOrderLockScope([], [])).not.toThrow()
  })
  for (const actual of [["A", "new"], ["new"], []]) {
    test(`rejects a changed Order lock set: ${actual.join(",")}`, () => {
      expect(() => assertReviewedCostOrderLockScope(actual, ["A"])).toThrow(
        "Order identities changed",
      )
    })
  }
  test("rejects duplicate declared existing Order locks", () => {
    expect(() => assertReviewedCostOrderLockScope(["A"], ["A", "A"])).toThrow(
      "duplicate identities",
    )
  })
  test("binds actual facts, retains prerequisites and does not mutate inputs", () => {
    const input = fixture()
    const before = structuredClone(input)
    const result = auditReviewedCostConnectedSnapshot(input)
    expect(result.scope).toBe("CONNECTED_PHYSICAL_AND_PRODUCT_RETURNS")
    expect(result.requiresOwningSourceProof).toBe(true)
    expect(result.requiresMonetaryProof).toBe(true)
    expect(result.requiresPostedJournalProof).toBe(true)
    expect(result.requiresPriorReviewProof).toBe(true)
    expect(result.physical.balances).toEqual(input.physical.balances)
    expect(input).toEqual(before)
    expect(
      auditReviewedCostConnectedSnapshot(input).connectedSnapshotHash,
    ).toBe(result.connectedSnapshotHash)
  })
  test("does not rely on caller-supplied component hashes alone", () => {
    const input = fixture()
    const hash = auditReviewedCostConnectedSnapshot(input).connectedSnapshotHash
    first(input.physical.balances).snapshot.revision++
    expect(
      auditReviewedCostConnectedSnapshot(input).connectedSnapshotHash,
    ).not.toBe(hash)
  })
  for (const key of [
    "balanceSourceIds",
    "movementIds",
    "operationIds",
    "orderLineIds",
    "productReturnIds",
    "reviewAllocationIds",
    "transferIds",
  ] as const) {
    test(`rejects concurrent ${key} expansion without trusting the old hash`, () => {
      const input = fixture()
      input.revalidatedDiscovery[key].push("new-source")
      expect(() =>
        assertUnchangedReviewedCostDiscovery(
          input.discovery,
          input.revalidatedDiscovery,
        ),
      ).toThrow("discovery changed")
    })
  }
  test("rejects concurrent nonphysical source drift even if identities/hashes agree", () => {
    const input = fixture()
    input.revalidatedReturns.snapshot.closedThrough = through
    expect(() => auditReviewedCostConnectedSnapshot(input)).toThrow(
      "return facts changed",
    )
  })
  for (const target of ["physical", "returns"] as const) {
    for (const field of [
      "tenantId",
      "bookId",
      "currencyCode",
      "bookSequence",
    ] as const) {
      test(`rejects ${target} ${field} snapshot mismatch`, () => {
        const input = fixture()
        const scope =
          target === "physical" ? input.physical : input.returns.snapshot
        if (field === "bookSequence") scope[field] = 1n
        else scope[field] = "crossed"
        input.revalidatedReturns = structuredClone(input.returns)
        expect(() => auditReviewedCostConnectedSnapshot(input)).toThrow(
          "Tenant/currency Book",
        )
      })
    }
  }
  test("rejects incomplete physical balance coverage", () => {
    const input = fixture()
    input.physical.balances = []
    expect(() => auditReviewedCostConnectedSnapshot(input)).toThrow(
      "Connected balances",
    )
  })
  test("rejects duplicate physical balances", () => {
    const input = fixture()
    input.physical.balances.push(
      structuredClone(first(input.physical.balances)),
    )
    expect(() => auditReviewedCostConnectedSnapshot(input)).toThrow(
      "Connected balances",
    )
  })
  test("rejects a source operation with no physical history", () => {
    const input = fixture()
    input.discovery.operationIds = ["detached"]
    input.revalidatedDiscovery = structuredClone(input.discovery)
    expect(() => auditReviewedCostConnectedSnapshot(input)).toThrow(
      "Connected operations",
    )
  })
  test("rejects a discovered movement omitted from physical history", () => {
    const input = fixture()
    input.discovery.movementIds = ["hidden"]
    input.revalidatedDiscovery = structuredClone(input.discovery)
    expect(() => auditReviewedCostConnectedSnapshot(input)).toThrow(
      "Connected movements",
    )
  })
  test("rejects omitted nonphysical returns", () => {
    const input = fixture()
    input.discovery.productReturnIds = ["hidden-return"]
    input.revalidatedDiscovery = structuredClone(input.discovery)
    expect(() => auditReviewedCostConnectedSnapshot(input)).toThrow(
      "Connected Product returns",
    )
  })
  test("rejects omitted owning Order Lines", () => {
    const input = fixture()
    input.discovery.orderLineIds = ["hidden-line"]
    input.revalidatedDiscovery = structuredClone(input.discovery)
    expect(() => auditReviewedCostConnectedSnapshot(input)).toThrow(
      "Connected owning Order Lines",
    )
  })
  for (const date of [new Date(through.getTime() + 1), new Date(Number.NaN)]) {
    test(`rejects nonphysical return beyond physical cutoff: ${date.getTime()}`, () => {
      const input = fixture()
      input.discovery.productReturnIds = ["return"]
      input.revalidatedDiscovery = structuredClone(input.discovery)
      changeBothReturns(input, (returns) => {
        returns.snapshot.returns.push({
          id: "return",
          orderLineId: "line",
          disposition: "NO_RESTOCK",
          stockOperationId: null,
          destinationBalanceSourceId: null,
          effectiveAt: date,
          actorUserId: "actor",
          payloadHash: "a".repeat(64),
        })
      })
      expect(() => auditReviewedCostConnectedSnapshot(input)).toThrow(
        "history-through",
      )
    })
  }
})
