import type { FinanceInventoryPool } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { FinanceError, financeAmount } from "./rules"
import { addQuantities, normalizeQuantity } from "./valuation-math"

const MAX_DATABASE_MINOR = 9223372036854775807n

type Pool = Pick<
  FinanceInventoryPool,
  | "quantity"
  | "valueMinor"
  | "unknownReason"
  | "lastMovementCount"
  | "lastSequence"
  | "latestEffectiveAt"
>

/** Exact receipt impact. movementCount includes the proposed/new receipt movement. */
export function calculatePurchaseReceiptValuation(input: {
  quantityBefore: string
  canonicalEffect: string
  quantityAfter: string
  sourceCostMinor: bigint
  effectiveAt: Date
  movementCount: number
  pool: Pool | null
}) {
  const before = normalizeQuantity(input.quantityBefore)
  const effect = normalizeQuantity(input.canonicalEffect)
  const after = normalizeQuantity(input.quantityAfter)
  const sourceCostMinor = financeAmount(input.sourceCostMinor.toString())
  const { effectiveAt, movementCount, pool } = input
  if (effect === "0" || addQuantities(before, effect) !== after)
    throw new FinanceError(
      "CONFLICT",
      "Purchase receipt quantity is inconsistent.",
    )
  if (pool && effectiveAt < pool.latestEffectiveAt)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A costed receipt cannot precede its latest valuation event.",
    )
  if (!Number.isSafeInteger(movementCount) || movementCount < 1) {
    throw new FinanceError(
      "CONFLICT",
      "Inventory movement history cannot be counted.",
    )
  }
  const movementCountExact = BigInt(movementCount)
  let valueBeforeMinor: bigint | null = null
  let unknownReason: FinanceInventoryUnknownReason | null = null
  if (!pool) {
    if (before === "0" && movementCountExact === BigInt(1)) {
      valueBeforeMinor = BigInt(0)
    } else {
      unknownReason =
        before === "0" ? "UNCAPTURED_MOVEMENTS" : "MISSING_OPENING_COST"
    }
  } else if (
    normalizeQuantity(pool.quantity.toFixed()) !== before ||
    pool.lastMovementCount + BigInt(1) !== movementCountExact
  ) {
    unknownReason = "UNCAPTURED_MOVEMENTS"
  } else if (pool.valueMinor === null) {
    unknownReason = pool.unknownReason ?? "PRIOR_UNKNOWN_COST"
  } else {
    if (pool.valueMinor < BigInt(0) || pool.unknownReason !== null) {
      throw new FinanceError(
        "CONFLICT",
        "The inventory valuation pool is inconsistent.",
      )
    }
    valueBeforeMinor = pool.valueMinor
  }
  const valueAfterMinor =
    valueBeforeMinor === null ? null : valueBeforeMinor + sourceCostMinor
  if (valueAfterMinor !== null && valueAfterMinor > MAX_DATABASE_MINOR) {
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Inventory carrying value exceeds its limit.",
    )
  }
  const sequence = (pool?.lastSequence ?? BigInt(0)) + BigInt(1)
  if (sequence > MAX_DATABASE_MINOR) {
    throw new FinanceError(
      "CONFLICT",
      "Inventory valuation sequence exceeds its limit.",
    )
  }
  return {
    quantityBefore: before,
    canonicalEffect: effect,
    quantityAfter: after,
    sourceCostMinor,
    movementCountExact,
    sequence,
    valueBeforeMinor,
    valueDeltaMinor: valueBeforeMinor === null ? null : sourceCostMinor,
    valueAfterMinor,
    unknownReason,
    status:
      valueAfterMinor === null ? ("UNKNOWN" as const) : ("KNOWN" as const),
  }
}
