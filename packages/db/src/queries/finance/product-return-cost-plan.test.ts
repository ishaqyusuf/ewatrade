import { expect, test } from "bun:test"
import { planProductReturnCost, type CostState, type OriginalReturnIssue } from "./product-return-cost-plan"
function plan(overrides: Partial<Parameters<typeof planProductReturnCost>[0]> = {}) {
  return planProductReturnCost({
    tenantId: "tenant", bookId: "book", orderLineId: "line", canonicalReturned: "4", hasUncapturedPriorReturn: false,
    fulfillmentIds: ["first", "second"],
    issues: new Map<string, OriginalReturnIssue>([
      ["first", { quantity: "3", sourceCost: 100n, unknownReason: null, originalIssueId: "issue-first" }],
      ["second", { quantity: "3", sourceCost: 200n, unknownReason: null, originalIssueId: "issue-second" }],
    ]),
    priorAllocations: new Map<string, CostState>(),
    ...overrides,
  })
}

test("allocates across original issues in supplied canonical order", () => {
  const result = plan()
  expect(result.sourceCostMinor).toBe(167n)
  expect(result.allocations.map(row => [row.fulfillmentId, row.canonicalQuantity, row.sourceCostMinor])).toEqual([["first", "3", 100n], ["second", "1", 67n]])
  expect(result.unknownReason).toBeNull()
})

test("uses previously validated residual cost rather than repricing the original", () => {
  const result = plan({ canonicalReturned: "2", priorAllocations: new Map([["first", { quantity: "2", cost: 67n, unknownReason: null }]]) })
  expect(result.sourceCostMinor).toBe(67n)
  expect(result.allocations[0]).toMatchObject({ remainingCostBeforeMinor: 67n, remainingCostAfterMinor: 0n, remainingQuantityAfter: "0" })
})

test("mixed known and unknown original issues never fabricate a total", () => {
  const result = plan({ issues: new Map([
    ["first", { quantity: "3", sourceCost: 100n, unknownReason: null, originalIssueId: "issue-first" }],
    ["second", { quantity: "3", sourceCost: null, unknownReason: "MISSING_ISSUE_COST", originalIssueId: null }],
  ]) })
  expect(result.sourceCostMinor).toBeNull()
  expect(result.unknownReason).toBe("MISSING_ISSUE_COST")
  expect(result.allocations[0]?.sourceCostMinor).toBe(100n)
  expect(result.allocations[1]?.sourceCostMinor).toBeNull()
})

test("uncaptured return history has no invented allocations", () => {
  const result = plan({ hasUncapturedPriorReturn: true })
  expect(result).toEqual({ allocations: [], sourceCostMinor: null, unknownReason: "UNCAPTURED_RETURNS" })
})

test("missing issue and exhausted quantity fail before a plan is returned", () => {
  expect(() => plan({ issues: new Map() })).toThrow("source disappeared")
  expect(() => plan({ canonicalReturned: "7" })).toThrow("quantity remaining")
})
