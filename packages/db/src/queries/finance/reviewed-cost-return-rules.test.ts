import { describe, expect, test } from "bun:test"
import {
  type ReviewedReturnAllocation,
  type ReviewedReturnHeader,
  type ReviewedReturnIssue,
  auditReviewedCostReturnBudgets,
} from "./reviewed-cost-return-rules"

function row<T>(rows: T[], index = 0): T {
  const value = rows[index]
  if (value === undefined) throw new Error("Missing test fixture row")
  return value
}

const scope = { tenantId: "tenant", bookId: "book", orderLineId: "line" }
function fixture() {
  const issues: ReviewedReturnIssue[] = [
    {
      ...scope,
      fulfillmentId: "fulfillment",
      originalIssueId: "issue",
      canonicalQuantity: "3",
      sourceCostMinor: 5n,
      unknownReason: null,
    },
  ]
  const returns: ReviewedReturnHeader[] = [
    {
      ...scope,
      id: "cost1",
      productReturnId: "return1",
      canonicalQuantity: "1",
      disposition: "NO_RESTOCK",
      sourceCostMinor: 2n,
      unknownReason: null,
    },
    {
      ...scope,
      id: "cost2",
      productReturnId: "return2",
      canonicalQuantity: "1",
      disposition: "RESTOCK",
      sourceCostMinor: 2n,
      unknownReason: null,
    },
    {
      ...scope,
      id: "cost3",
      productReturnId: "return3",
      canonicalQuantity: "1",
      disposition: "NO_RESTOCK",
      sourceCostMinor: 1n,
      unknownReason: null,
    },
  ]
  const allocations: ReviewedReturnAllocation[] = [
    {
      ...scope,
      id: "z-first",
      returnCostId: "cost1",
      fulfillmentId: "fulfillment",
      originalIssueId: "issue",
      canonicalQuantity: "1",
      remainingQuantityBefore: "3",
      remainingQuantityAfter: "2",
      sourceCostMinor: 2n,
      remainingCostBeforeMinor: 5n,
      remainingCostAfterMinor: 3n,
      unknownReason: null,
    },
    {
      ...scope,
      id: "a-second",
      returnCostId: "cost2",
      fulfillmentId: "fulfillment",
      originalIssueId: "issue",
      canonicalQuantity: "1",
      remainingQuantityBefore: "2",
      remainingQuantityAfter: "1",
      sourceCostMinor: 2n,
      remainingCostBeforeMinor: 3n,
      remainingCostAfterMinor: 1n,
      unknownReason: null,
    },
    {
      ...scope,
      id: "m-last",
      returnCostId: "cost3",
      fulfillmentId: "fulfillment",
      originalIssueId: "issue",
      canonicalQuantity: "1",
      remainingQuantityBefore: "1",
      remainingQuantityAfter: "0",
      sourceCostMinor: 1n,
      remainingCostBeforeMinor: 1n,
      remainingCostAfterMinor: 0n,
      unknownReason: null,
    },
  ]
  return {
    ...scope,
    orderedCanonicalQuantity: "3",
    issues,
    returns,
    allocations,
  }
}

describe("complete original return budgets", () => {
  test("non-restock and restock share one exact residual, independent of IDs/input order", () => {
    const input = fixture()
    const result = auditReviewedCostReturnBudgets(input)
    expect(result.returnedCanonicalQuantity).toBe("3")
    expect(result.remaining[0]?.remainingQuantity).toBe("0")
    expect(result.remaining[0]?.remainingCostMinor).toBe(0n)
    expect(result.remaining[0]?.allocationIds).toEqual([
      "z-first",
      "a-second",
      "m-last",
    ])
    input.allocations.reverse()
    input.returns.reverse()
    expect(auditReviewedCostReturnBudgets(input)).toEqual(result)
    expect(result.requiresMonetaryProof).toBe(true)
  })
  test("partial returns retain the unreturned original residual", () => {
    const input = fixture()
    input.returns.pop()
    input.allocations.pop()
    expect(auditReviewedCostReturnBudgets(input).remaining[0]).toMatchObject({
      remainingQuantity: "1",
      remainingCostMinor: 1n,
    })
  })
  test("unknown original costs remain unknown even at full return", () => {
    const input = fixture()
    for (const row of [
      ...input.issues,
      ...input.returns,
      ...input.allocations,
    ]) {
      row.sourceCostMinor = null
      row.unknownReason = "MISSING_OPENING_COST"
    }
    for (const row of input.allocations) {
      row.remainingCostBeforeMinor = null
      row.remainingCostAfterMinor = null
    }
    expect(
      auditReviewedCostReturnBudgets(input).remaining[0]?.remainingCostMinor,
    ).toBeNull()
  })
  test("zero known costs remain explicitly known", () => {
    const input = fixture()
    for (const row of [...input.issues, ...input.returns, ...input.allocations])
      row.sourceCostMinor = 0n
    for (const row of input.allocations) {
      row.remainingCostBeforeMinor = 0n
      row.remainingCostAfterMinor = 0n
    }
    expect(
      auditReviewedCostReturnBudgets(input).remaining[0]?.remainingCostMinor,
    ).toBe(0n)
  })
  test("all original fulfillments participate, including multiple allocations per return", () => {
    const input = fixture()
    input.orderedCanonicalQuantity = "6"
    input.issues.push({
      ...scope,
      fulfillmentId: "f2",
      originalIssueId: "i2",
      canonicalQuantity: "3",
      sourceCostMinor: 7n,
      unknownReason: null,
    })
    row(input.returns, 0).canonicalQuantity = "4"
    row(input.returns, 0).sourceCostMinor = 9n
    input.allocations.push({
      ...scope,
      id: "other-original",
      returnCostId: "cost1",
      fulfillmentId: "f2",
      originalIssueId: "i2",
      canonicalQuantity: "3",
      remainingQuantityBefore: "3",
      remainingQuantityAfter: "0",
      sourceCostMinor: 7n,
      remainingCostBeforeMinor: 7n,
      remainingCostAfterMinor: 0n,
      unknownReason: null,
    })
    expect(
      auditReviewedCostReturnBudgets(input).returnedCanonicalQuantity,
    ).toBe("6")
  })
  test("no returns preserves the entire original budget", () => {
    const input = fixture()
    input.returns = []
    input.allocations = []
    expect(auditReviewedCostReturnBudgets(input).remaining[0]).toMatchObject({
      remainingQuantity: "3",
      remainingCostMinor: 5n,
    })
  })
  for (const disposition of ["DAMAGED", "QUARANTINE"] as const)
    test(`${disposition} consumes the original budget without restocking`, () => {
      const input = fixture()
      row(input.returns).disposition = disposition
      expect(
        auditReviewedCostReturnBudgets(input).remaining[0]?.remainingQuantity,
      ).toBe("0")
    })
  test("equivalent exact quantity spellings produce the same fingerprint", () => {
    const input = fixture()
    const hash = auditReviewedCostReturnBudgets(input).returnBudgetHash
    input.orderedCanonicalQuantity = "3.000"
    row(input.issues).canonicalQuantity = "3.0"
    row(input.returns).canonicalQuantity = "1.000"
    row(input.allocations).canonicalQuantity = "1.0"
    row(input.allocations).remainingQuantityBefore = "3.00"
    row(input.allocations).remainingQuantityAfter = "2.00"
    expect(auditReviewedCostReturnBudgets(input).returnBudgetHash).toBe(hash)
  })
  test("fabricated return value cannot resolve an unknown original", () => {
    const input = fixture()
    row(input.issues).sourceCostMinor = null
    row(input.issues).unknownReason = "MISSING_OPENING_COST"
    row(input.allocations).remainingCostBeforeMinor = null
    expect(() => auditReviewedCostReturnBudgets(input)).toThrow(
      "Unknown original",
    )
  })
  const invalid: Array<[string, (input: ReturnType<typeof fixture>) => void]> =
    [
      [
        "over-return",
        (x) => {
          row(x.returns, 0).canonicalQuantity = "2"
        },
      ],
      [
        "over-fulfillment",
        (x) => {
          x.orderedCanonicalQuantity = "2"
        },
      ],
      [
        "missing earlier allocation",
        (x) => {
          x.allocations.shift()
          x.returns.shift()
        },
      ],
      [
        "forked quantity state",
        (x) => {
          row(x.allocations, 1).remainingQuantityBefore = "3"
        },
      ],
      [
        "wrong original issue",
        (x) => {
          row(x.allocations, 0).originalIssueId = "other"
        },
      ],
      [
        "absent original issue",
        (x) => {
          row(x.allocations, 0).originalIssueId = null
        },
      ],
      [
        "missing fulfillment",
        (x) => {
          row(x.allocations, 0).fulfillmentId = "other"
        },
      ],
      [
        "missing return header",
        (x) => {
          row(x.allocations, 0).returnCostId = "other"
        },
      ],
      [
        "duplicate fulfillment",
        (x) => {
          x.issues.push({ ...row(x.issues, 0) })
        },
      ],
      [
        "duplicate original issue",
        (x) => {
          x.issues.push({ ...row(x.issues, 0), fulfillmentId: "other" })
        },
      ],
      [
        "duplicate allocation",
        (x) => {
          x.allocations.push({ ...row(x.allocations, 0) })
        },
      ],
      [
        "duplicate per-header fulfillment",
        (x) => {
          x.allocations.push({ ...row(x.allocations, 0), id: "other" })
        },
      ],
      [
        "duplicate Product return",
        (x) => {
          row(x.returns, 1).productReturnId = "return1"
        },
      ],
      [
        "header cost drift",
        (x) => {
          row(x.returns, 0).sourceCostMinor = 1n
        },
      ],
      [
        "allocation rounding drift",
        (x) => {
          row(x.allocations, 1).sourceCostMinor = 1n
          row(x.allocations, 1).remainingCostAfterMinor = 2n
        },
      ],
      [
        "allocation before cost drift",
        (x) => {
          row(x.allocations, 0).remainingCostBeforeMinor = 6n
        },
      ],
      [
        "allocation after quantity drift",
        (x) => {
          row(x.allocations, 0).remainingQuantityAfter = "1"
        },
      ],
      [
        "zero allocated quantity",
        (x) => {
          row(x.allocations, 0).canonicalQuantity = "0"
        },
      ],
      [
        "negative original quantity",
        (x) => {
          row(x.issues, 0).canonicalQuantity = "-3"
        },
      ],
      [
        "negative original money",
        (x) => {
          row(x.issues, 0).sourceCostMinor = -1n
        },
      ],
      [
        "overflow original money",
        (x) => {
          row(x.issues, 0).sourceCostMinor = 9223372036854775808n
        },
      ],
      [
        "unknown without reason",
        (x) => {
          row(x.issues, 0).sourceCostMinor = null
        },
      ],
      [
        "known with unknown reason",
        (x) => {
          row(x.returns, 0).unknownReason = "PRIOR_UNKNOWN_COST"
        },
      ],
      [
        "crossed issue Tenant",
        (x) => {
          row(x.issues, 0).tenantId = "other"
        },
      ],
      [
        "crossed header Book",
        (x) => {
          row(x.returns, 0).bookId = "other"
        },
      ],
      [
        "crossed allocation line",
        (x) => {
          row(x.allocations, 0).orderLineId = "other"
        },
      ],
      [
        "uncaptured return allocation",
        (x) => {
          x.allocations = []
          row(x.returns, 0).sourceCostMinor = null
          row(x.returns, 0).unknownReason = "UNCAPTURED_RETURNS"
        },
      ],
    ]
  for (const [label, mutate] of invalid)
    test(`rejects ${label}`, () => {
      const input = fixture()
      mutate(input)
      expect(() => auditReviewedCostReturnBudgets(input)).toThrow()
    })
  test("facts are immutable and changing disposition changes the snapshot", () => {
    const input = fixture()
    const before = structuredClone(input)
    const hash = auditReviewedCostReturnBudgets(input).returnBudgetHash
    expect(input).toEqual(before)
    row(input.returns, 0).disposition = "RESTOCK"
    expect(auditReviewedCostReturnBudgets(input).returnBudgetHash).not.toBe(
      hash,
    )
  })
  test("oversized connected return components cannot be silently sliced", () => {
    const input = fixture()
    input.allocations = Array.from({ length: 4097 }, (_, n) => ({
      ...row(input.allocations, 0),
      id: String(n),
    }))
    expect(() => auditReviewedCostReturnBudgets(input)).toThrow("bounded")
  })
})
