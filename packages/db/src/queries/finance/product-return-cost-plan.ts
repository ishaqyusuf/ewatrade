import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { FinanceError } from "./rules"
import { calculateWeightedAverageIssue, subtractQuantities } from "./valuation-math"
const MAX_DATABASE_MINOR = BigInt("9223372036854775807")
const ZERO = BigInt(0)
function conflict(message: string): never { throw new FinanceError("CONFLICT", message) }

export type CostState = {
  quantity: string
  cost: bigint | null
  unknownReason: FinanceInventoryUnknownReason | null
}

export function allocateOriginalIssueReturnCost(
  before: CostState,
  quantity: string,
  issueKnown: boolean,
): { after: CostState; allocatedCost: bigint | null } {
  if (!issueKnown || before.cost === null) {
    return {
      after: {
        quantity: subtractQuantities(before.quantity, quantity),
        cost: null,
        unknownReason: before.unknownReason ?? "PRIOR_UNKNOWN_COST",
      },
      allocatedCost: null,
    }
  }
  const result = calculateWeightedAverageIssue({
    quantityBefore: before.quantity,
    valueBeforeMinor: before.cost,
    quantityIssued: quantity,
  })
  return {
    after: {
      quantity: result.quantityAfter,
      cost: result.valueAfterMinor,
      unknownReason: null,
    },
    allocatedCost: result.valueIssuedMinor,
  }
}

export type OriginalReturnIssue = {
  quantity: string
  sourceCost: bigint | null
  unknownReason: FinanceInventoryUnknownReason | null
  originalIssueId: string | null
}

/** Pure planner; caller validates provenance/history and supplies canonical issue order. */
export function planProductReturnCost(input: {
  tenantId: string; bookId: string; orderLineId: string
  canonicalReturned: string; hasUncapturedPriorReturn: boolean
  fulfillmentIds: string[]
  issues: ReadonlyMap<string, OriginalReturnIssue>
  priorAllocations: ReadonlyMap<string, CostState>
}) {
  let unallocated = input.canonicalReturned
  const allocations: Omit<
    Prisma.FinanceProductReturnCostAllocationUncheckedCreateInput,
    "returnCostId"
  >[] = []
  let sourceCostTotal = ZERO
  let allCostsKnown = !input.hasUncapturedPriorReturn
  let unknownReason: FinanceInventoryUnknownReason | null =
    input.hasUncapturedPriorReturn ? "UNCAPTURED_RETURNS" : null
  for (const fulfillmentId of input.hasUncapturedPriorReturn ? [] : input.fulfillmentIds) {
    if (unallocated === "0") break
    const info = input.issues.get(fulfillmentId)
    if (!info) conflict("Product return fulfillment source disappeared.")
    const before = input.priorAllocations.get(fulfillmentId) ?? {
      quantity: info.quantity,
      cost: info.sourceCost,
      unknownReason: info.unknownReason,
    }
    if (before.quantity === "0") continue
    const quantity =
      compareExactDecimals(unallocated, before.quantity) <= 0
        ? unallocated
        : before.quantity
    const calculated = allocateOriginalIssueReturnCost(
      before,
      quantity,
      info.sourceCost !== null,
    )
    allocations.push({
      tenantId: input.tenantId,
      bookId: input.bookId,
      orderLineId: input.orderLineId,
      fulfillmentId,
      originalIssueId: info.originalIssueId,
      canonicalQuantity: quantity,
      remainingQuantityBefore: before.quantity,
      remainingQuantityAfter: calculated.after.quantity,
      sourceCostMinor: calculated.allocatedCost,
      remainingCostBeforeMinor: before.cost,
      remainingCostAfterMinor: calculated.after.cost,
      unknownReason:
        calculated.allocatedCost === null
          ? (info.unknownReason ??
            calculated.after.unknownReason ??
            "PRIOR_UNKNOWN_COST")
          : null,
    })
    if (calculated.allocatedCost === null) {
      allCostsKnown = false
      unknownReason ??=
        info.unknownReason ??
        calculated.after.unknownReason ??
        "PRIOR_UNKNOWN_COST"
    } else sourceCostTotal += calculated.allocatedCost
    unallocated = subtractQuantities(unallocated, quantity)
  }
  if (!input.hasUncapturedPriorReturn && unallocated !== "0") {
    conflict(
      "Product return quantity exceeds original fulfillment quantity remaining.",
    )
  }
  if (sourceCostTotal > MAX_DATABASE_MINOR) {
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Returned original cost exceeds its limit.",
    )
  }

  return {
    allocations,
    sourceCostMinor: allCostsKnown ? sourceCostTotal : null,
    unknownReason: allCostsKnown ? null : (unknownReason ?? "PRIOR_UNKNOWN_COST"),
  }
}
