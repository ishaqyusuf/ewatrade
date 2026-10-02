import { describe, expect, test } from "bun:test"
import {
  type ReviewedAssemblyPhysical,
  type ReviewedAssemblyReturns,
  type ReviewedMovementSemantics,
  assembleReviewedCostTrace,
} from "./reviewed-cost-assembly"
import { previewReviewedInventoryCostTrace } from "./reviewed-cost-trace"

const scope = {
  tenantId: "tenant",
  bookId: "book",
  currencyCode: "NGN",
  bookSequence: 0n,
}
const at = (n: number) => new Date(Date.UTC(2026, 1, 1) + n * 1000)
function row<T>(values: T[], index = 0): T {
  const value = values[index]
  if (value === undefined) throw new Error("Missing assembly fixture row")
  return value
}
type Movement =
  ReviewedAssemblyPhysical["balances"][number]["movements"][number]
function movement(
  id: string,
  balanceSourceId: string,
  before: string,
  after: string,
  effect: string,
  cost: bigint | null,
  date: number,
): Movement {
  return {
    id,
    balanceSourceId,
    canonicalBefore: before,
    canonicalAfter: after,
    signedCanonicalEffect: effect,
    operation: { id: `op-${id}`, effectiveAt: at(date) },
    valuation: { id: `event-${id}`, sourceCostMinor: cost },
  }
}
function pool(
  id: string,
  ending: string,
  movements: Movement[],
): ReviewedAssemblyPhysical["balances"][number] {
  return {
    balanceSourceId: id,
    snapshot: { productId: "product", variantId: "variant" },
    canonicalOnHandQuantity: ending,
    impliedBaselineQuantity: "0",
    orderedMovementIds: movements.map((row) => row.id),
    physicalQuantityReconciled: true,
    issues: [],
    movements,
  }
}
function fixture() {
  const physical: ReviewedAssemblyPhysical = {
    ...scope,
    through: at(20),
    physicalSnapshotHash: "physical-proof",
    balances: [
      pool("A", "6", [
        movement("z-opening", "A", "0", "10", "10", 100n, 1),
        movement("issue", "A", "10", "6", "-4", 40n, 3),
        movement("a-later", "A", "6", "8", "2", 40n, 5),
        movement("transfer-out", "A", "8", "6", "-2", 25n, 6),
      ]),
      pool("B", "3", [
        movement("zero", "B", "0", "0", "0", 0n, 1),
        movement("transfer-in", "B", "0", "2", "2", 25n, 6),
        movement("restock", "B", "2", "3", "1", 10n, 8),
      ]),
    ],
  }
  const owner = {
    tenantId: scope.tenantId,
    bookId: scope.bookId,
    orderLineId: "line",
  }
  const returns: ReviewedAssemblyReturns = {
    sourceSnapshotHash: "return-proof",
    snapshot: {
      ...scope,
      fulfillments: [
        {
          id: "fulfillment",
          orderLineId: "line",
          reservationId: "reservation",
          stockOperationId: "op-issue",
          stockMovementId: "issue",
          effectiveAt: at(3),
          actorUserId: "actor",
          payloadHash: "a".repeat(64),
        },
      ],
      returns: [
        {
          id: "nonphysical",
          orderLineId: "line",
          disposition: "NO_RESTOCK",
          stockOperationId: null,
          destinationBalanceSourceId: null,
          effectiveAt: at(4),
          actorUserId: "actor",
          payloadHash: "a".repeat(64),
        },
        {
          id: "physical-return",
          orderLineId: "line",
          disposition: "RESTOCK",
          stockOperationId: "op-restock",
          destinationBalanceSourceId: "B",
          effectiveAt: at(8),
          actorUserId: "actor",
          payloadHash: "a".repeat(64),
        },
      ],
    },
    issues: [
      {
        ...owner,
        fulfillmentId: "fulfillment",
        originalIssueId: "event-issue",
        canonicalQuantity: "4",
        sourceCostMinor: 40n,
        unknownReason: null,
      },
    ],
    returns: [
      {
        ...owner,
        id: "cost-n",
        productReturnId: "nonphysical",
        disposition: "NO_RESTOCK",
        canonicalQuantity: "1",
        sourceCostMinor: 10n,
        unknownReason: null,
      },
      {
        ...owner,
        id: "cost-r",
        productReturnId: "physical-return",
        disposition: "RESTOCK",
        canonicalQuantity: "1",
        sourceCostMinor: 10n,
        unknownReason: null,
      },
    ],
    allocations: [
      {
        ...owner,
        id: "n",
        returnCostId: "cost-n",
        fulfillmentId: "fulfillment",
        originalIssueId: "event-issue",
        canonicalQuantity: "1",
        remainingQuantityBefore: "4",
        remainingQuantityAfter: "3",
        sourceCostMinor: 10n,
        remainingCostBeforeMinor: 40n,
        remainingCostAfterMinor: 30n,
        unknownReason: null,
      },
      {
        ...owner,
        id: "r",
        returnCostId: "cost-r",
        fulfillmentId: "fulfillment",
        originalIssueId: "event-issue",
        canonicalQuantity: "1",
        remainingQuantityBefore: "3",
        remainingQuantityAfter: "2",
        sourceCostMinor: 10n,
        remainingCostBeforeMinor: 30n,
        remainingCostAfterMinor: 20n,
        unknownReason: null,
      },
    ],
  }
  const semantics: ReviewedMovementSemantics[] = [
    { movementId: "z-opening", kind: "ORIGIN" },
    { movementId: "issue", kind: "WITHDRAWAL", purpose: "PRODUCT_ISSUE" },
    { movementId: "a-later", kind: "ORIGIN" },
    { movementId: "transfer-out", kind: "TRANSFER_OUT" },
    { movementId: "zero", kind: "ORIGIN" },
    {
      movementId: "transfer-in",
      kind: "TRANSFER_IN",
      originalMovementId: "transfer-out",
    },
    {
      movementId: "restock",
      kind: "RETURN_RESTOCK",
      productReturnId: "physical-return",
    },
  ]
  return { physical, returns, semantics }
}
function preview(input: ReturnType<typeof fixture>) {
  const assembled = assembleReviewedCostTrace(input)
  return {
    assembled,
    preview: previewReviewedInventoryCostTrace({
      ...assembled,
      evidence: [],
      now: at(20),
    }),
  }
}

describe("canonical persisted-source assembly", () => {
  test("combines certified physical order, transfers and nonphysical/cross-pool returns with exact value conservation", () => {
    const { assembled, preview: result } = preview(fixture())
    expect(assembled.nodes).toHaveLength(8)
    expect(result.externalCostMinor).toBe(140n)
    expect(result.remainingInventoryCostMinor).toBe(110n)
    expect(result.netWithdrawnCostMinor).toBe(30n)
    expect(
      assembled.nodes.find((node) => node.id === "return-allocation:n"),
    ).toMatchObject({
      kind: "RETURN_NON_RESTOCK",
      balanceSourceId: "A",
      quantityBefore: "6",
      quantityAfter: "6",
      ordinal: 3n,
      originalIssueId: "movement:issue",
      returnOrdinal: 1n,
    })
    expect(
      assembled.nodes.find((node) => node.id === "return-allocation:r"),
    ).toMatchObject({
      kind: "RETURN_RESTOCK",
      balanceSourceId: "B",
      quantityBefore: "2",
      quantityAfter: "3",
      originalIssueId: "movement:issue",
      returnOrdinal: 2n,
    })
    expect(assembled.requiresOwningSourceProof).toBe(true)
    expect(assembled.requiresCoordinatedSnapshotProof).toBe(true)
    expect(assembled.requiresMonetaryProof).toBe(true)
    expect(assembled.requiresPostedJournalProof).toBe(true)
  })
  test("input order and movement IDs do not replace certified physical sequence", () => {
    const input = fixture()
    const original = assembleReviewedCostTrace(input)
    input.physical.balances.reverse()
    for (const pool of input.physical.balances) pool.movements.reverse()
    input.returns.allocations.reverse()
    input.returns.returns.reverse()
    input.semantics.reverse()
    expect(assembleReviewedCostTrace(input)).toEqual(original)
  })
  test("equal-date neutral metadata commutes with unrelated physical receipts", () => {
    const input = fixture()
    row(input.returns.snapshot.returns).effectiveAt = at(5)
    const { assembled, preview: result } = preview(input)
    expect(result.remainingInventoryCostMinor).toBe(110n)
    expect(
      assembled.nodes.find((node) => node.id === "return-allocation:n"),
    ).toMatchObject({ quantityBefore: "8", quantityAfter: "8" })
  })
  for (const disposition of ["DAMAGED", "QUARANTINE"] as const)
    test(`retains ${disposition} metadata as an original budget consumption`, () => {
      const input = fixture()
      row(input.returns.returns).disposition = disposition
      row(input.returns.snapshot.returns).disposition = disposition
      expect(preview(input).preview.remainingInventoryCostMinor).toBe(110n)
    })
  test("unknown original money stays unknown across transfers and returns", () => {
    const input = fixture()
    for (const pool of input.physical.balances)
      for (const movement of pool.movements) {
        if (movement.valuation && movement.id !== "zero")
          movement.valuation.sourceCostMinor = null
      }
    for (const row of [
      ...input.returns.issues,
      ...input.returns.returns,
      ...input.returns.allocations,
    ]) {
      row.sourceCostMinor = null
      row.unknownReason = "MISSING_OPENING_COST"
    }
    for (const row of input.returns.allocations) {
      row.remainingCostBeforeMinor = null
      row.remainingCostAfterMinor = null
    }
    const result = preview(input).preview
    expect(result.externalCostMinor).toBeNull()
    expect(result.remainingInventoryCostMinor).toBeNull()
    expect(result.netWithdrawnCostMinor).toBeNull()
  })
  test("physical restock splits allocations from two original issues without losing their residual budgets", () => {
    const input = fixture()
    input.physical.balances = [
      pool("A", "2", [
        movement("opening", "A", "0", "4", "4", 10n, 1),
        movement("f1", "A", "4", "3", "-1", 2n, 2),
        movement("f2", "A", "3", "2", "-1", 3n, 3),
      ]),
      pool("B", "2", [
        movement("zero", "B", "0", "0", "0", 0n, 1),
        movement("restock", "B", "0", "2", "2", 5n, 8),
      ]),
    ]
    input.semantics = [
      { movementId: "opening", kind: "ORIGIN" },
      { movementId: "f1", kind: "WITHDRAWAL", purpose: "PRODUCT_ISSUE" },
      { movementId: "f2", kind: "WITHDRAWAL", purpose: "PRODUCT_ISSUE" },
      { movementId: "zero", kind: "ORIGIN" },
      {
        movementId: "restock",
        kind: "RETURN_RESTOCK",
        productReturnId: "physical-return",
      },
    ]
    input.returns.returns = [
      {
        ...row(input.returns.returns, 1),
        canonicalQuantity: "2",
        sourceCostMinor: 5n,
      },
    ]
    input.returns.snapshot.returns = [row(input.returns.snapshot.returns, 1)]
    input.returns.issues = [
      {
        ...row(input.returns.issues),
        fulfillmentId: "f1",
        originalIssueId: "event-f1",
        canonicalQuantity: "1",
        sourceCostMinor: 2n,
      },
      {
        ...row(input.returns.issues),
        fulfillmentId: "f2",
        originalIssueId: "event-f2",
        canonicalQuantity: "1",
        sourceCostMinor: 3n,
      },
    ]
    const fulfillment = row(input.returns.snapshot.fulfillments)
    input.returns.snapshot.fulfillments = [
      {
        ...fulfillment,
        id: "f1",
        stockMovementId: "f1",
        stockOperationId: "op-f1",
        effectiveAt: at(2),
      },
      {
        ...fulfillment,
        id: "f2",
        stockMovementId: "f2",
        stockOperationId: "op-f2",
        effectiveAt: at(3),
      },
    ]
    const allocation = row(input.returns.allocations, 1)
    input.returns.allocations = [
      {
        ...allocation,
        id: "r1",
        fulfillmentId: "f1",
        originalIssueId: "event-f1",
        remainingQuantityBefore: "1",
        remainingQuantityAfter: "0",
        sourceCostMinor: 2n,
        remainingCostBeforeMinor: 2n,
        remainingCostAfterMinor: 0n,
      },
      {
        ...allocation,
        id: "r2",
        fulfillmentId: "f2",
        originalIssueId: "event-f2",
        remainingQuantityBefore: "1",
        remainingQuantityAfter: "0",
        sourceCostMinor: 3n,
        remainingCostBeforeMinor: 3n,
        remainingCostAfterMinor: 0n,
      },
    ]
    const { assembled, preview: result } = preview(input)
    expect(assembled.nodes).toHaveLength(6)
    expect(
      assembled.nodes
        .filter((node) => node.kind === "RETURN_RESTOCK")
        .map((node) => [node.quantityBefore, node.quantityAfter]),
    ).toEqual([
      ["0", "1"],
      ["1", "2"],
    ])
    expect(result.remainingInventoryCostMinor).toBe(10n)
    expect(result.netWithdrawnCostMinor).toBe(0n)
  })
  const invalid: Array<[string, (input: ReturnType<typeof fixture>) => void]> =
    [
      [
        "crossed scope",
        (x) => {
          x.returns.snapshot.bookId = "other"
        },
      ],
      [
        "changed Book sequence",
        (x) => {
          x.returns.snapshot.bookSequence = 1n
        },
      ],
      [
        "missing original baseline",
        (x) => {
          row(x.physical.balances).impliedBaselineQuantity = "1"
        },
      ],
      [
        "unregistered physical history",
        (x) => {
          row(x.physical.balances).issues.push("UNREGISTERED_MOVEMENTS")
        },
      ],
      [
        "ambiguous physical order",
        (x) => {
          row(x.physical.balances).orderedMovementIds = null
        },
      ],
      [
        "partial physical order",
        (x) => {
          row(x.physical.balances).orderedMovementIds?.pop()
        },
      ],
      [
        "unreconciled quantities",
        (x) => {
          row(x.physical.balances).physicalQuantityReconciled = false
        },
      ],
      [
        "missing owning semantics",
        (x) => {
          x.semantics.pop()
        },
      ],
      [
        "duplicate semantic",
        (x) => {
          x.semantics.push({ ...row(x.semantics) })
        },
      ],
      [
        "unknown physical identity",
        (x) => {
          row(x.semantics).movementId = "other"
        },
      ],
      [
        "sign-derived false Product issue",
        (x) => {
          x.semantics[1] = { movementId: "issue", kind: "ORIGIN" }
        },
      ],
      [
        "missing transfer outgoing",
        (x) => {
          x.semantics[5] = {
            movementId: "transfer-in",
            kind: "TRANSFER_IN",
            originalMovementId: "missing",
          }
        },
      ],
      [
        "crossed transfer Product",
        (x) => {
          row(x.physical.balances, 1).snapshot.productId = "other"
        },
      ],
      [
        "transfer outgoing misclassification",
        (x) => {
          x.semantics[3] = {
            movementId: "transfer-out",
            kind: "WITHDRAWAL",
            purpose: "ORDINARY",
          }
        },
      ],
      [
        "missing original issue",
        (x) => {
          row(x.returns.issues).originalIssueId = "other"
        },
      ],
      [
        "changed original issue quantity",
        (x) => {
          row(x.returns.issues).canonicalQuantity = "3"
        },
      ],
      [
        "changed original issue money",
        (x) => {
          row(x.returns.issues).sourceCostMinor = 41n
        },
      ],
      [
        "non-Product original purpose",
        (x) => {
          x.semantics[1] = {
            movementId: "issue",
            kind: "WITHDRAWAL",
            purpose: "ORDINARY",
          }
        },
      ],
      [
        "return budget gap",
        (x) => {
          row(x.returns.allocations).remainingQuantityBefore = "3"
        },
      ],
      [
        "return residual drift",
        (x) => {
          row(x.returns.allocations).remainingQuantityAfter = "2"
        },
      ],
      [
        "metadata predating original issue",
        (x) => {
          row(x.returns.snapshot.returns).effectiveAt = at(2)
        },
      ],
      [
        "metadata reversing original return order",
        (x) => {
          row(x.returns.snapshot.returns).effectiveAt = at(9)
        },
      ],
      [
        "missing nonphysical allocation",
        (x) => {
          x.returns.allocations.shift()
        },
      ],
      [
        "nonphysical return with stock effect",
        (x) => {
          row(x.returns.snapshot.returns).stockOperationId = "op-restock"
        },
      ],
      [
        "restock header quantity drift",
        (x) => {
          row(x.returns.returns, 1).canonicalQuantity = "2"
        },
      ],
      [
        "restock header cost drift",
        (x) => {
          row(x.returns.returns, 1).sourceCostMinor = 11n
        },
      ],
      [
        "restock source date drift",
        (x) => {
          row(x.returns.snapshot.returns, 1).effectiveAt = at(7)
        },
      ],
      [
        "crossed return allocation",
        (x) => {
          row(x.returns.allocations).tenantId = "other"
        },
      ],
      [
        "orphan allocation",
        (x) => {
          x.returns.allocations.push({
            ...row(x.returns.allocations),
            id: "orphan",
            returnCostId: "other",
          })
        },
      ],
      [
        "changed physical delta",
        (x) => {
          row(row(x.physical.balances).movements).canonicalAfter = "9"
        },
      ],
      [
        "changed ending snapshot",
        (x) => {
          row(x.physical.balances).canonicalOnHandQuantity = "5"
        },
      ],
      [
        "return outside declared history",
        (x) => {
          row(x.returns.snapshot.returns).effectiveAt = at(21)
        },
      ],
    ]
  invalid.push(
    [
      "crossed issue Book",
      (x) => {
        row(x.returns.issues).bookId = "other"
      },
    ],
    [
      "crossed return Order Line",
      (x) => {
        row(x.returns.snapshot.returns).orderLineId = "other"
      },
    ],
    [
      "changed return disposition",
      (x) => {
        row(x.returns.snapshot.returns).disposition = "DAMAGED"
      },
    ],
  )
  test("cyclic cross-pool dependencies reject despite equal owning dates and valid individual quantities", () => {
    const input = fixture()
    input.returns.issues = []
    input.returns.returns = []
    input.returns.allocations = []
    input.returns.snapshot.fulfillments = []
    input.returns.snapshot.returns = []
    input.physical.balances = [
      pool("A", "2", [
        movement("a-open", "A", "0", "2", "2", 2n, 1),
        movement("a-in", "A", "2", "3", "1", 1n, 2),
        movement("a-out", "A", "3", "2", "-1", 1n, 2),
      ]),
      pool("B", "2", [
        movement("b-open", "B", "0", "2", "2", 2n, 1),
        movement("b-in", "B", "2", "3", "1", 1n, 2),
        movement("b-out", "B", "3", "2", "-1", 1n, 2),
      ]),
    ]
    input.semantics = [
      { movementId: "a-open", kind: "ORIGIN" },
      { movementId: "b-open", kind: "ORIGIN" },
      { movementId: "a-in", kind: "TRANSFER_IN", originalMovementId: "b-out" },
      { movementId: "a-out", kind: "TRANSFER_OUT" },
      { movementId: "b-in", kind: "TRANSFER_IN", originalMovementId: "a-out" },
      { movementId: "b-out", kind: "TRANSFER_OUT" },
    ]
    expect(() => assembleReviewedCostTrace(input)).toThrow("cycle")
  })
  test("oversized components cannot be represented by a partial movement set", () => {
    const input = fixture()
    const rows = Array.from({ length: 4097 }, (_, n) =>
      movement(`large-${n}`, "A", String(n), String(n + 1), "1", 1n, 1),
    )
    input.physical.balances = [pool("A", "4097", rows)]
    input.semantics = rows.map((row) => ({
      movementId: row.id,
      kind: "ORIGIN",
    }))
    expect(() => assembleReviewedCostTrace(input)).toThrow()
  })
  for (const [label, mutate] of invalid)
    test(`rejects ${label}`, () => {
      const input = fixture()
      mutate(input)
      expect(() => assembleReviewedCostTrace(input)).toThrow()
    })
  test("source objects are immutable and assembled facts are bound beyond input identity hashes", () => {
    const input = fixture()
    const before = structuredClone(input)
    const hash = assembleReviewedCostTrace(input).assemblySnapshotHash
    expect(input).toEqual(before)
    const valuation = row(row(input.physical.balances).movements).valuation
    if (!valuation) throw new Error("Missing original valuation")
    valuation.sourceCostMinor = 101n
    expect(assembleReviewedCostTrace(input).assemblySnapshotHash).not.toBe(hash)
  })
})

test("ordinary correction restoration preserves original cost after intervening stock and then allocates replacement", () => {
  const physical: ReviewedAssemblyPhysical = {
    ...scope,
    through: at(20),
    physicalSnapshotHash: "correction-physical",
    balances: [
      pool("A", "5", [
        movement("opening", "A", "0", "5", "5", 500n, 1),
        movement("ordinary", "A", "5", "3", "-2", 200n, 2),
        movement("later", "A", "3", "4", "1", 100n, 3),
        movement("inverse", "A", "4", "6", "2", 200n, 4),
        movement("replacement", "A", "6", "5", "-1", 100n, 4),
      ]),
    ],
  }
  const returns: ReviewedAssemblyReturns = {
    sourceSnapshotHash: "no-product-returns",
    snapshot: { ...scope, fulfillments: [], returns: [] },
    issues: [],
    returns: [],
    allocations: [],
  }
  const semantics: ReviewedMovementSemantics[] = [
    { movementId: "opening", kind: "ORIGIN" },
    { movementId: "ordinary", kind: "WITHDRAWAL", purpose: "ORDINARY" },
    { movementId: "later", kind: "ORIGIN" },
    {
      movementId: "inverse",
      kind: "RESTORATION",
      originalMovementId: "ordinary",
    },
    { movementId: "replacement", kind: "WITHDRAWAL", purpose: "ORDINARY" },
  ]
  const assembled = assembleReviewedCostTrace({ physical, returns, semantics })
  const restoration = assembled.nodes.find((n) => n.id === "movement:inverse")
  expect(restoration).toMatchObject({
    kind: "RESTORATION",
    originalIssueId: "movement:ordinary",
    quantity: "2",
    recordedCostMinor: 200n,
  })
  const preview = previewReviewedInventoryCostTrace({
    ...scope,
    through: at(20),
    now: at(21),
    pools: assembled.pools,
    nodes: assembled.nodes,
    evidence: [],
  })
  expect(preview.completeCostTrace).toBe(true)
  expect(preview.pools[0]?.valueMinor).toBe(500n)
  const wrong = semantics.map((s) =>
    s.kind === "RESTORATION" ? { ...s, originalMovementId: "later" } : s,
  )
  expect(() =>
    assembleReviewedCostTrace({ physical, returns, semantics: wrong }),
  ).toThrow()
  const duplicate = {
    ...physical,
    balances: [
      pool("A", "7", [
        ...row(physical.balances).movements,
        movement("second-inverse", "A", "5", "7", "2", 200n, 5),
      ]),
    ],
  }
  expect(() =>
    previewReviewedInventoryCostTrace({
      ...scope,
      now: at(21),
      ...assembleReviewedCostTrace({
        physical: duplicate,
        returns,
        semantics: [
          ...semantics,
          {
            movementId: "second-inverse",
            kind: "RESTORATION",
            originalMovementId: "ordinary",
          },
        ],
      }),
      evidence: [],
    }),
  ).toThrow()
})
