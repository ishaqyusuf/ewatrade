import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import type {
  FinanceInventoryUnknownReason,
  ProductReturnDisposition,
} from "../../../generated/prisma/enums"
import { FinanceError, financePayloadHash } from "./rules"
import {
  addQuantities,
  calculateWeightedAverageIssue,
  normalizeQuantity,
  subtractQuantities,
} from "./valuation-math"

type RecordedCost = {
  sourceCostMinor: bigint | null
  unknownReason: FinanceInventoryUnknownReason | null
}
type Scoped = { tenantId: string; bookId: string; orderLineId: string }
export type ReviewedReturnIssue = Scoped &
  RecordedCost & {
    fulfillmentId: string
    originalIssueId: string
    canonicalQuantity: string
  }
export type ReviewedReturnHeader = Scoped &
  RecordedCost & {
    id: string
    productReturnId: string
    canonicalQuantity: string
    disposition: ProductReturnDisposition
  }
export type ReviewedReturnAllocation = Scoped &
  RecordedCost & {
    id: string
    returnCostId: string
    fulfillmentId: string
    originalIssueId: string | null
    canonicalQuantity: string
    remainingQuantityBefore: string
    remainingQuantityAfter: string
    remainingCostBeforeMinor: bigint | null
    remainingCostAfterMinor: bigint | null
  }

const MAX_MINOR = 9223372036854775807n
function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}
function quantity(value: string, positive = false) {
  const normalized = normalizeQuantity(value)
  if (positive && normalized === "0")
    conflict("Return quantity must be positive.")
  return normalized
}
function cost(record: RecordedCost) {
  if (
    record.sourceCostMinor === null
      ? !record.unknownReason
      : record.unknownReason !== null ||
        record.sourceCostMinor < 0n ||
        record.sourceCostMinor > MAX_MINOR
  )
    conflict(
      "Recorded original return cost has inconsistent known/unknown state.",
    )
}
function unique(ids: string[]) {
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length)
    conflict("Return provenance has missing or duplicate identities.")
}

/** A stock-protected reread may retain existing Order locks, never expand them. */
export function assertReviewedCostOrderLockScope(
  actualOrderIds: string[],
  expectedOrderIds?: string[],
) {
  if (expectedOrderIds === undefined) return
  unique(expectedOrderIds)
  const expected = [...expectedOrderIds].sort()
  const actual = [...actualOrderIds].sort()
  if (
    actual.length !== expected.length ||
    actual.some((id, index) => id !== expected[index])
  )
    conflict(
      "Owning Order identities changed; retry before acquiring new locks.",
    )
}

/** Complete original allocation budgets, independent of timestamp/ID ordering. */
export function auditReviewedCostReturnBudgets(
  input: Scoped & {
    orderedCanonicalQuantity: string
    issues: ReviewedReturnIssue[]
    returns: ReviewedReturnHeader[]
    allocations: ReviewedReturnAllocation[]
  },
) {
  if (
    input.issues.length + input.returns.length + input.allocations.length >
    4096
  )
    conflict("Complete return history exceeds its bounded source scope.")
  const ordered = quantity(input.orderedCanonicalQuantity, true)
  unique(input.issues.map((row) => row.fulfillmentId))
  unique(input.issues.map((row) => row.originalIssueId))
  unique(input.returns.map((row) => row.id))
  unique(input.returns.map((row) => row.productReturnId))
  unique(input.allocations.map((row) => row.id))
  unique(
    input.allocations.map((row) => `${row.returnCostId}:${row.fulfillmentId}`),
  )
  for (const row of [...input.issues, ...input.returns, ...input.allocations]) {
    if (
      row.tenantId !== input.tenantId ||
      row.bookId !== input.bookId ||
      row.orderLineId !== input.orderLineId
    )
      conflict("Return budget source ownership differs from the held scope.")
    quantity(row.canonicalQuantity, true)
    cost(row)
  }
  const issues = new Map(input.issues.map((row) => [row.fulfillmentId, row]))
  const headers = new Map(input.returns.map((row) => [row.id, row]))
  let fulfilled = "0"
  for (const row of input.issues)
    fulfilled = addQuantities(fulfilled, row.canonicalQuantity)
  let returned = "0"
  for (const row of input.returns)
    returned = addQuantities(returned, row.canonicalQuantity)
  if (
    compareExactDecimals(fulfilled, ordered) > 0 ||
    compareExactDecimals(returned, fulfilled) > 0
  )
    conflict(
      "Complete returns exceed the original fulfilled or ordered budget.",
    )
  for (const allocation of input.allocations) {
    if (
      !issues.has(allocation.fulfillmentId) ||
      !headers.has(allocation.returnCostId)
    )
      conflict(
        "Return allocation has no original fulfillment or return header.",
      )
  }
  const remaining = input.issues
    .map((issue) => {
      let remainingQuantity = quantity(issue.canonicalQuantity)
      let remainingCostMinor = issue.sourceCostMinor
      const chain = input.allocations
        .filter((row) => row.fulfillmentId === issue.fulfillmentId)
        .sort((a, b) =>
          compareExactDecimals(
            b.remainingQuantityBefore,
            a.remainingQuantityBefore,
          ),
        )
      for (const allocation of chain) {
        const allocated = quantity(allocation.canonicalQuantity, true)
        const before = quantity(allocation.remainingQuantityBefore)
        const after = quantity(allocation.remainingQuantityAfter)
        if (
          allocation.originalIssueId !== issue.originalIssueId ||
          before !== remainingQuantity ||
          compareExactDecimals(allocated, before) > 0 ||
          subtractQuantities(before, allocated) !== after ||
          allocation.remainingCostBeforeMinor !== remainingCostMinor
        )
          conflict(
            "Original return allocation chain is missing, forked or inconsistent.",
          )
        if (remainingCostMinor === null) {
          if (
            allocation.sourceCostMinor !== null ||
            allocation.remainingCostAfterMinor !== null ||
            allocation.unknownReason !== issue.unknownReason
          )
            conflict(
              "Unknown original issue cost cannot acquire a fabricated return value.",
            )
        } else {
          const expected = calculateWeightedAverageIssue({
            quantityBefore: before,
            quantityIssued: allocated,
            valueBeforeMinor: remainingCostMinor,
          })
          if (
            allocation.sourceCostMinor !== expected.valueIssuedMinor ||
            allocation.remainingCostAfterMinor !== expected.valueAfterMinor ||
            allocation.unknownReason !== null
          )
            conflict(
              "Returned cost differs from the exact original residual allocation.",
            )
          remainingCostMinor = expected.valueAfterMinor
        }
        remainingQuantity = after
      }
      return {
        fulfillmentId: issue.fulfillmentId,
        originalIssueId: issue.originalIssueId,
        remainingQuantity,
        remainingCostMinor,
        allocationIds: chain.map((row) => row.id),
      }
    })
    .sort((a, b) => a.fulfillmentId.localeCompare(b.fulfillmentId))
  for (const header of input.returns) {
    const allocations = input.allocations.filter(
      (row) => row.returnCostId === header.id,
    )
    let sum = "0"
    let minor = 0n
    let unknown = false
    for (const row of allocations) {
      sum = addQuantities(sum, row.canonicalQuantity)
      if (row.sourceCostMinor === null) unknown = true
      else minor += row.sourceCostMinor
    }
    if (
      sum !== quantity(header.canonicalQuantity) ||
      header.sourceCostMinor !== (unknown ? null : minor) ||
      (unknown &&
        !allocations.some((row) => row.unknownReason === header.unknownReason))
    )
      conflict("Return header does not conserve all original allocations.")
  }
  const facts = {
    tenantId: input.tenantId,
    bookId: input.bookId,
    orderLineId: input.orderLineId,
    orderedCanonicalQuantity: ordered,
    issues: input.issues
      .map((row) => ({
        ...row,
        canonicalQuantity: quantity(row.canonicalQuantity),
      }))
      .sort((a, b) => a.fulfillmentId.localeCompare(b.fulfillmentId)),
    returns: input.returns
      .map((row) => ({
        ...row,
        canonicalQuantity: quantity(row.canonicalQuantity),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    allocations: input.allocations
      .map((row) => ({
        ...row,
        canonicalQuantity: quantity(row.canonicalQuantity),
        remainingQuantityBefore: quantity(row.remainingQuantityBefore),
        remainingQuantityAfter: quantity(row.remainingQuantityAfter),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
  return {
    fulfilledCanonicalQuantity: fulfilled,
    returnedCanonicalQuantity: returned,
    remaining,
    returnBudgetHash: financePayloadHash(facts),
    requiresMonetaryProof: true as const,
  }
}
