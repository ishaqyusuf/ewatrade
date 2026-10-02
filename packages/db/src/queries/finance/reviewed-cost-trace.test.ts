import { describe, expect, test } from "bun:test"
import {
  type ReviewedCostTraceNode,
  type ReviewedCostTracePool,
  previewReviewedInventoryCostTrace,
} from "./reviewed-cost-trace"
import { FinanceError } from "./rules"

type Input = Parameters<typeof previewReviewedInventoryCostTrace>[0]
const date = new Date("2026-10-01T12:00:00.000Z")
const maxMinor = 9223372036854775807n
function pool(id: string, ending: string): ReviewedCostTracePool {
  return {
    balanceSourceId: id,
    tenantId: "tenant",
    bookId: "book",
    currencyCode: "NGN",
    productId: "product",
    variantId: "variant",
    expectedEndingQuantity: ending,
  }
}
function common(
  id: string,
  source: string,
  ordinal: number,
  before: string,
  after: string,
  q: string,
  recordedCostMinor: bigint | null = null,
) {
  return {
    id,
    balanceSourceId: source,
    ordinal: BigInt(ordinal),
    effectiveAt: date,
    quantityBefore: before,
    quantityAfter: after,
    quantity: q,
    recordedCostMinor,
  }
}
function input(
  nodes: ReviewedCostTraceNode[],
  pools = [pool("a", "3")],
  evidence: Input["evidence"] = [
    {
      eventId: "opening",
      originalCostMinor: 1001n,
      evidenceReference: "opening-count:approved-invoice",
      mode: "RESOLVE_UNKNOWN",
    },
  ],
): Input {
  return {
    tenantId: "tenant",
    bookId: "book",
    currencyCode: "NGN",
    through: date,
    now: date,
    pools,
    nodes,
    evidence,
  }
}
function basic(): Input {
  return input([
    { ...common("opening", "a", 1, "0", "4", "4"), kind: "ORIGIN" },
    {
      ...common("issue", "a", 2, "4", "3", "1"),
      kind: "WITHDRAWAL",
      purpose: "PRODUCT_ISSUE",
    },
  ])
}
function cost(
  result: ReturnType<typeof previewReviewedInventoryCostTrace>,
  id: string,
) {
  const allocation = result.allocations.find((row) => row.node.id === id)
  if (!allocation) throw new Error(`Missing test allocation ${id}`)
  return allocation
}
function reject(value: Input, message?: string) {
  try {
    previewReviewedInventoryCostTrace(value)
    throw new Error("Expected rejected trace")
  } catch (error) {
    expect(error).toBeInstanceOf(FinanceError)
    if (!(error instanceof FinanceError)) throw error
    expect(error.code).toBe("CONFLICT")
    if (message) expect(error.message).toContain(message)
  }
}

describe("reviewed original inventory cost shadow trace", () => {
  test("binds preview to exact evidence, prior monetary facts and cutoff while normalizing input order and decimals", () => {
    const value = basic()
    const hash = previewReviewedInventoryCostTrace(value).costTraceHash
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    const equivalent = structuredClone(value)
    equivalent.nodes.reverse()
    equivalent.now = new Date(date.getTime() + 1000)
    const first = equivalent.pools[0]
    if (first) first.expectedEndingQuantity = "3.000"
    for (const node of equivalent.nodes) {
      node.quantity = `${node.quantity}.000`
      node.quantityBefore = `${node.quantityBefore}.000`
      node.quantityAfter = `${node.quantityAfter}.000`
    }
    expect(previewReviewedInventoryCostTrace(equivalent).costTraceHash).toBe(
      hash,
    )
    for (const change of [
      (changed: Input) => {
        const fact = changed.evidence[0]
        if (fact) fact.originalCostMinor = 1002n
      },
      (changed: Input) => {
        const fact = changed.evidence[0]
        if (fact) fact.evidenceReference = "another-invoice"
      },
      (changed: Input) => {
        const node = changed.nodes[1]
        if (node) node.recordedCostMinor = 250n
      },
      (changed: Input) => {
        changed.through = new Date(date.getTime() + 1)
        changed.now = changed.through
      },
    ]) {
      const changed = structuredClone(value)
      change(changed)
      expect(previewReviewedInventoryCostTrace(changed).costTraceHash).not.toBe(
        hash,
      )
    }
  })

  test("reconciles consumed and remaining original cost without inventing posted-zero deltas", () => {
    const result = previewReviewedInventoryCostTrace(basic())
    expect(result.completeCostTrace).toBe(true)
    expect(result.missingOriginEventIds).toEqual([])
    expect(result.externalCostMinor).toBe(1001n)
    expect(result.remainingInventoryCostMinor).toBe(751n)
    expect(result.netWithdrawnCostMinor).toBe(250n)
    expect(cost(result, "issue").resolvedCostMinor).toBe(250n)
    expect(cost(result, "issue").differenceMinor).toBeNull()
    expect(cost(result, "opening").node.recordedCostMinor).toBeNull()
  })

  test("shows corrected known allocations and takes the exact final residual", () => {
    const value = input(
      [
        { ...common("opening", "a", 1, "0", "4", "4", 101n), kind: "ORIGIN" },
        {
          ...common("first", "a", 2, "4", "3", "1", 25n),
          kind: "WITHDRAWAL",
          purpose: "ORDINARY",
        },
        {
          ...common("last", "a", 3, "3", "0", "3", 76n),
          kind: "WITHDRAWAL",
          purpose: "ORDINARY",
        },
      ],
      [pool("a", "0")],
      [
        {
          eventId: "opening",
          originalCostMinor: 105n,
          evidenceReference: "corrected-invoice",
          mode: "CORRECT_RECORDED",
        },
      ],
    )
    const result = previewReviewedInventoryCostTrace(value)
    expect(cost(result, "first").resolvedCostMinor).toBe(26n)
    expect(cost(result, "first").differenceMinor).toBe(1n)
    expect(cost(result, "last").resolvedCostMinor).toBe(79n)
    expect(cost(result, "last").differenceMinor).toBe(3n)
    expect(result.remainingInventoryCostMinor).toBe(0n)
    expect(result.netWithdrawnCostMinor).toBe(105n)
  })

  test("returns use original issue residual even after a differently priced receipt", () => {
    const value = input(
      [
        { ...common("opening", "a", 1, "0", "3", "3"), kind: "ORIGIN" },
        {
          ...common("issue", "a", 2, "3", "0", "3"),
          kind: "WITHDRAWAL",
          purpose: "PRODUCT_ISSUE",
        },
        {
          ...common("new-receipt", "a", 3, "0", "2", "2", 400n),
          kind: "ORIGIN",
        },
        {
          ...common("restock", "a", 4, "2", "3", "1"),
          kind: "RETURN_RESTOCK",
          originalIssueId: "issue",
          returnOrdinal: 1n,
          originalRemainingQuantityBefore: "3",
        },
        {
          ...common("nonrestock", "a", 5, "3", "3", "1"),
          kind: "RETURN_NON_RESTOCK",
          originalIssueId: "issue",
          returnOrdinal: 2n,
          originalRemainingQuantityBefore: "2",
        },
        {
          ...common("restock-last", "a", 6, "3", "4", "1"),
          kind: "RETURN_RESTOCK",
          originalIssueId: "issue",
          returnOrdinal: 3n,
          originalRemainingQuantityBefore: "1",
        },
      ],
      [pool("a", "4")],
    )
    const result = previewReviewedInventoryCostTrace(value)
    expect(cost(result, "restock").resolvedCostMinor).toBe(334n)
    expect(cost(result, "nonrestock").resolvedCostMinor).toBe(334n)
    expect(cost(result, "restock-last").resolvedCostMinor).toBe(333n)
    expect(result.externalCostMinor).toBe(1401n)
    expect(result.remainingInventoryCostMinor).toBe(1067n)
    expect(result.netWithdrawnCostMinor).toBe(334n)
  })

  test("preserves cost across a three-pool paired custody/package path and a cross-pool return", () => {
    const value = input(
      [
        { ...common("opening", "a", 1, "0", "4", "4"), kind: "ORIGIN" },
        { ...common("out-a", "a", 2, "4", "1", "3"), kind: "TRANSFER_OUT" },
        {
          ...common("in-b", "b", 1, "0", "3", "3"),
          kind: "TRANSFER_IN",
          sourceEventId: "out-a",
        },
        { ...common("out-b", "b", 2, "3", "1", "2"), kind: "TRANSFER_OUT" },
        {
          ...common("in-c", "c", 1, "0", "2", "2"),
          kind: "TRANSFER_IN",
          sourceEventId: "out-b",
        },
        {
          ...common("issue", "c", 2, "2", "0", "2"),
          kind: "WITHDRAWAL",
          purpose: "PRODUCT_ISSUE",
        },
        {
          ...common("return-a", "a", 3, "1", "2", "1"),
          kind: "RETURN_RESTOCK",
          originalIssueId: "issue",
          returnOrdinal: 1n,
          originalRemainingQuantityBefore: "2",
        },
      ],
      [pool("a", "2"), pool("b", "1"), pool("c", "0")],
    )
    const result = previewReviewedInventoryCostTrace(value)
    expect(cost(result, "out-a").resolvedCostMinor).toBe(751n)
    expect(cost(result, "in-b").resolvedCostMinor).toBe(751n)
    expect(cost(result, "out-b").resolvedCostMinor).toBe(501n)
    expect(cost(result, "in-c").resolvedCostMinor).toBe(501n)
    expect(cost(result, "return-a").resolvedCostMinor).toBe(250n)
    expect(result.pools.map((row) => row.valueMinor)).toEqual([500n, 250n, 0n])
    expect(result.netWithdrawnCostMinor).toBe(251n)
    expect(result.externalCostMinor).toBe(1001n)
    expect(
      previewReviewedInventoryCostTrace({
        ...value,
        nodes: [...value.nodes].reverse(),
        pools: [...value.pools].reverse(),
      }),
    ).toEqual(result)
  })

  test("restoration recovers the original withdrawal cost rather than the current pool price", () => {
    const value = input(
      [
        { ...common("opening", "a", 1, "0", "4", "4"), kind: "ORIGIN" },
        {
          ...common("shortage", "a", 2, "4", "2", "2"),
          kind: "WITHDRAWAL",
          purpose: "COUNT_SHORTAGE",
        },
        { ...common("receipt", "a", 3, "2", "3", "1", 900n), kind: "ORIGIN" },
        {
          ...common("restore", "a", 4, "3", "4", "1"),
          kind: "RESTORATION",
          originalIssueId: "shortage",
          returnOrdinal: 1n,
          originalRemainingQuantityBefore: "2",
        },
      ],
      [pool("a", "4")],
    )
    const result = previewReviewedInventoryCostTrace(value)
    expect(cost(result, "shortage").resolvedCostMinor).toBe(500n)
    expect(cost(result, "restore").resolvedCostMinor).toBe(250n)
    expect(result.remainingInventoryCostMinor).toBe(1651n)
    expect(result.netWithdrawnCostMinor).toBe(250n)
  })

  test("keeps missing original evidence explicit and does not fabricate zero cost", () => {
    const value = basic()
    value.evidence = []
    const result = previewReviewedInventoryCostTrace(value)
    expect(result.completeCostTrace).toBe(false)
    expect(result.missingOriginEventIds).toEqual(["opening"])
    expect(result.externalCostMinor).toBeNull()
    expect(result.remainingInventoryCostMinor).toBeNull()
    expect(result.netWithdrawnCostMinor).toBeNull()
    expect(cost(result, "issue").resolvedCostMinor).toBeNull()
  })

  test("retains a known incoming allocation into a destination with another unresolved origin", () => {
    const value = input(
      [
        { ...common("opening", "a", 1, "0", "4", "4"), kind: "ORIGIN" },
        { ...common("out", "a", 2, "4", "3", "1"), kind: "TRANSFER_OUT" },
        { ...common("unknown-b", "b", 1, "0", "1", "1"), kind: "ORIGIN" },
        {
          ...common("in", "b", 2, "1", "2", "1"),
          kind: "TRANSFER_IN",
          sourceEventId: "out",
        },
      ],
      [pool("a", "3"), pool("b", "2")],
    )
    const result = previewReviewedInventoryCostTrace(value)
    expect(cost(result, "in").resolvedCostMinor).toBe(250n)
    expect(result.pools.map((row) => row.valueMinor)).toEqual([751n, null])
    expect(result.missingOriginEventIds).toEqual(["unknown-b"])
    expect(result.completeCostTrace).toBe(false)
  })

  test("preserves exact fractional half-even and full-depletion residual allocation", () => {
    const value = input(
      [
        { ...common("opening", "a", 1, "0", "2", "2"), kind: "ORIGIN" },
        {
          ...common("half", "a", 2, "2", "1.5", "0.5"),
          kind: "WITHDRAWAL",
          purpose: "ORDINARY",
        },
        {
          ...common("last", "a", 3, "1.5", "0", "1.5"),
          kind: "WITHDRAWAL",
          purpose: "ORDINARY",
        },
      ],
      [pool("a", "0")],
    )
    const fact = value.evidence[0]
    if (!fact) throw new Error("Missing fixture evidence")
    fact.originalCostMinor = 6n
    const result = previewReviewedInventoryCostTrace(value)
    expect(cost(result, "half").resolvedCostMinor).toBe(2n)
    expect(cost(result, "last").resolvedCostMinor).toBe(4n)
    expect(result.netWithdrawnCostMinor).toBe(6n)
  })

  test("keeps aggregate reporting totals exact beyond one database BIGINT without overflowing any pool", () => {
    const value = input(
      [
        {
          ...common("large-a", "a", 1, "0", "1", "1", maxMinor),
          kind: "ORIGIN",
        },
        {
          ...common("large-b", "b", 1, "0", "1", "1", maxMinor),
          kind: "ORIGIN",
        },
      ],
      [pool("a", "1"), pool("b", "1")],
      [],
    )
    const result = previewReviewedInventoryCostTrace(value)
    expect(result.externalCostMinor).toBe(maxMinor * 2n)
    expect(result.remainingInventoryCostMinor).toBe(maxMinor * 2n)
    expect(result.netWithdrawnCostMinor).toBe(0n)
  })

  test("retains real known-zero origins and never mutates caller inputs", () => {
    const value = input(
      [{ ...common("zero", "a", 1, "0", "0", "0", 0n), kind: "ORIGIN" }],
      [pool("a", "0")],
      [],
    )
    const before = structuredClone(value)
    const result = previewReviewedInventoryCostTrace(value)
    expect(value).toEqual(before)
    expect(result.completeCostTrace).toBe(true)
    expect(result.remainingInventoryCostMinor).toBe(0n)
  })

  test.each([
    [
      "Tenant",
      (value: Input) => {
        value.tenantId = "other"
      },
    ],
    [
      "Book",
      (value: Input) => {
        value.bookId = "other"
      },
    ],
    [
      "currency",
      (value: Input) => {
        value.currencyCode = "USD"
      },
    ],
    [
      "future cutoff",
      (value: Input) => {
        value.through = new Date(date.getTime() + 1)
      },
    ],
    [
      "invalid cutoff",
      (value: Input) => {
        value.through = new Date("invalid")
      },
    ],
    [
      "empty pools",
      (value: Input) => {
        value.pools = []
      },
    ],
    [
      "empty trace",
      (value: Input) => {
        value.nodes = []
      },
    ],
    [
      "duplicate pool",
      (value: Input) => {
        const first = value.pools[0]
        if (first) value.pools.push({ ...first })
      },
    ],
    [
      "duplicate node",
      (value: Input) => {
        const first = value.nodes[0]
        if (first) value.nodes.push({ ...first })
      },
    ],
    [
      "duplicate evidence",
      (value: Input) => {
        const first = value.evidence[0]
        if (first) value.evidence.push({ ...first })
      },
    ],
    [
      "wrong evidence mode",
      (value: Input) => {
        const fact = value.evidence[0]
        if (fact) fact.mode = "CORRECT_RECORDED"
      },
    ],
    [
      "empty evidence",
      (value: Input) => {
        const fact = value.evidence[0]
        if (fact) fact.evidenceReference = " "
      },
    ],
    [
      "withdrawal evidence",
      (value: Input) => {
        const fact = value.evidence[0]
        if (fact) fact.eventId = "issue"
      },
    ],
    [
      "negative cost",
      (value: Input) => {
        const fact = value.evidence[0]
        if (fact) fact.originalCostMinor = -1n
      },
    ],
    [
      "cost overflow",
      (value: Input) => {
        const fact = value.evidence[0]
        if (fact) fact.originalCostMinor = maxMinor + 1n
      },
    ],
    [
      "ordinal gap",
      (value: Input) => {
        const node = value.nodes[1]
        if (node) node.ordinal = 3n
      },
    ],
    [
      "ordinal duplication",
      (value: Input) => {
        const node = value.nodes[1]
        if (node) node.ordinal = 1n
      },
    ],
    [
      "missing pool",
      (value: Input) => {
        const node = value.nodes[1]
        if (node) node.balanceSourceId = "missing"
      },
    ],
    [
      "future node",
      (value: Input) => {
        const node = value.nodes[1]
        if (node) node.effectiveAt = new Date(date.getTime() + 1)
      },
    ],
    [
      "reversed chronology",
      (value: Input) => {
        const node = value.nodes[1]
        if (node) node.effectiveAt = new Date(date.getTime() - 1)
      },
    ],
    [
      "stale prior quantity",
      (value: Input) => {
        const node = value.nodes[1]
        if (node) node.quantityBefore = "5"
      },
    ],
    [
      "stale result quantity",
      (value: Input) => {
        const node = value.nodes[1]
        if (node) node.quantityAfter = "2"
      },
    ],
    [
      "overwithdrawal",
      (value: Input) => {
        const node = value.nodes[1]
        if (node) node.quantity = "5"
      },
    ],
    [
      "unknown overwithdrawal",
      (value: Input) => {
        value.evidence = []
        const node = value.nodes[1]
        if (node) node.quantity = "5"
      },
    ],
    [
      "quantity precision",
      (value: Input) => {
        const node = value.nodes[0]
        if (node) node.quantity = "4.0000000000000000001"
      },
    ],
    [
      "nonpositive withdrawal",
      (value: Input) => {
        const node = value.nodes[1]
        if (node) node.quantity = "0"
      },
    ],
    [
      "stale ending quantity",
      (value: Input) => {
        const first = value.pools[0]
        if (first) first.expectedEndingQuantity = "2"
      },
    ],
  ])("rejects %s", (_name, change) => {
    const value = basic()
    change(value)
    reject(value)
  })

  test("rejects per-pool monetary and exact quantity addition overflow", () => {
    reject(
      input(
        [
          {
            ...common("opening", "a", 1, "0", "4", "4", maxMinor),
            kind: "ORIGIN",
          },
          { ...common("receipt", "a", 2, "4", "5", "1", 1n), kind: "ORIGIN" },
        ],
        [pool("a", "5")],
        [],
      ),
      "minor-unit",
    )
    const maxQuantity = "99999999999999999999.999999999999999999"
    reject(
      input(
        [
          {
            ...common("opening", "a", 1, "0", maxQuantity, maxQuantity, 0n),
            kind: "ORIGIN",
          },
          {
            ...common(
              "receipt",
              "a",
              2,
              maxQuantity,
              maxQuantity,
              "0.000000000000000001",
              0n,
            ),
            kind: "ORIGIN",
          },
        ],
        [pool("a", maxQuantity)],
        [],
      ),
      "addition",
    )
  })

  test("rejects return over-allocation and stale/duplicate return budgets", () => {
    for (const mutation of ["quantity", "budget", "ordinal"]) {
      const value = basic()
      value.nodes.push({
        ...common(
          "return",
          "a",
          3,
          "3",
          "4",
          mutation === "quantity" ? "2" : "1",
        ),
        kind: "RETURN_RESTOCK",
        originalIssueId: "issue",
        returnOrdinal: mutation === "ordinal" ? 2n : 1n,
        originalRemainingQuantityBefore: mutation === "budget" ? "2" : "1",
      })
      const first = value.pools[0]
      if (first) first.expectedEndingQuantity = "4"
      reject(value)
    }
    const value = basic()
    value.nodes.push(
      {
        ...common("nonrestock", "a", 3, "3", "3", "1"),
        kind: "RETURN_NON_RESTOCK",
        originalIssueId: "issue",
        returnOrdinal: 1n,
        originalRemainingQuantityBefore: "1",
      },
      {
        ...common("second", "a", 4, "3", "4", "1"),
        kind: "RETURN_RESTOCK",
        originalIssueId: "issue",
        returnOrdinal: 2n,
        originalRemainingQuantityBefore: "0",
      },
    )
    reject(value, "remaining quantity")
  })

  test("rejects non-restock metadata that changes physical quantity", () => {
    const value = basic()
    value.nodes.push({
      ...common("return", "a", 3, "3", "4", "1"),
      kind: "RETURN_NON_RESTOCK",
      originalIssueId: "issue",
      returnOrdinal: 1n,
      originalRemainingQuantityBefore: "1",
    })
    reject(value, "resulting quantity")
  })

  test("rejects unmatched, duplicate, dimension-changing and quantity-changing transfers", () => {
    const nodes: ReviewedCostTraceNode[] = [
      { ...common("opening", "a", 1, "0", "4", "4"), kind: "ORIGIN" },
      { ...common("out", "a", 2, "4", "3", "1"), kind: "TRANSFER_OUT" },
      {
        ...common("in", "b", 1, "0", "1", "1"),
        kind: "TRANSFER_IN",
        sourceEventId: "out",
      },
    ]
    reject(input(nodes.slice(0, 2)), "incomplete")
    const duplicate = input(
      [
        ...nodes,
        {
          ...common("duplicate", "b", 2, "1", "2", "1"),
          kind: "TRANSFER_IN",
          sourceEventId: "out",
        },
      ],
      [pool("a", "3"), pool("b", "2")],
    )
    reject(duplicate, "duplicates")
    const mismatched = input(structuredClone(nodes), [
      pool("a", "3"),
      pool("b", "1"),
    ])
    const destination = mismatched.pools[1]
    if (destination) destination.variantId = "different"
    reject(mismatched, "ownership")
    const unequal = input(structuredClone(nodes), [
      pool("a", "3"),
      pool("b", "1"),
    ])
    const incoming = unequal.nodes[2]
    if (incoming) incoming.quantity = "2"
    reject(unequal, "equal original")
  })

  test("rejects cyclic custody traces even when dates and pair dimensions agree", () => {
    reject(
      input(
        [
          {
            ...common("in-a", "a", 1, "0", "1", "1"),
            kind: "TRANSFER_IN",
            sourceEventId: "out-b",
          },
          { ...common("out-a", "a", 2, "1", "0", "1"), kind: "TRANSFER_OUT" },
          {
            ...common("in-b", "b", 1, "0", "1", "1"),
            kind: "TRANSFER_IN",
            sourceEventId: "out-a",
          },
          { ...common("out-b", "b", 2, "1", "0", "1"), kind: "TRANSFER_OUT" },
        ],
        [pool("a", "0"), pool("b", "0")],
        [],
      ),
      "cyclic",
    )
  })
})
