import type { FinanceInventoryPool } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { FinanceError } from "./rules"
import { normalizeQuantity } from "./valuation-math"
const ZERO = BigInt(0)
const MAX_DATABASE_MINOR = BigInt("9223372036854775807")
function conflict(message: string): never { throw new FinanceError("CONFLICT", message) }

/** movementCount includes the proposed return movement, for both preview and execution. */
export function productReturnDestinationImpact(input: {
  pool: Pick<FinanceInventoryPool, "quantity" | "valueMinor" | "unknownReason" | "lastMovementCount" | "lastSequence" | "latestEffectiveAt"> | null
  before: string
  movementCount: number
  effectiveAt: Date
  sourceCostMinor: bigint | null
  sourceUnknownReason: FinanceInventoryUnknownReason | null
}) {
  const { pool, before, movementCount, effectiveAt, sourceCostMinor, sourceUnknownReason } = input
  if (pool && effectiveAt < pool.latestEffectiveAt) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A Product return cannot precede its latest valuation event.",
    )
  }
  if (!Number.isSafeInteger(movementCount) || movementCount < 1) {
    conflict("Inventory movement history cannot be counted.")
  }
  const movementCountExact = BigInt(movementCount)
  let valueBeforeMinor: bigint | null = null
  let poolUnknown: FinanceInventoryUnknownReason | null = null
  if (!pool) {
    if (before === "0" && movementCountExact === BigInt(1))
      valueBeforeMinor = ZERO
    else
      poolUnknown =
        before === "0" ? "UNCAPTURED_MOVEMENTS" : "MISSING_OPENING_COST"
  } else if (
    normalizeQuantity(pool.quantity.toFixed()) !== before ||
    pool.lastMovementCount + BigInt(1) !== movementCountExact
  ) {
    poolUnknown = "UNCAPTURED_MOVEMENTS"
  } else if (pool.valueMinor === null) {
    poolUnknown = pool.unknownReason ?? "PRIOR_UNKNOWN_COST"
  } else {
    if (
      pool.valueMinor < ZERO ||
      pool.valueMinor > MAX_DATABASE_MINOR ||
      pool.unknownReason !== null
    ) {
      conflict("The inventory valuation pool is inconsistent.")
    }
    valueBeforeMinor = pool.valueMinor
  }
  const valueAfterMinor =
    valueBeforeMinor === null || sourceCostMinor === null
      ? null
      : valueBeforeMinor + sourceCostMinor
  if (valueAfterMinor !== null && valueAfterMinor > MAX_DATABASE_MINOR) {
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Inventory carrying value exceeds its limit.",
    )
  }
  const sequence = (pool?.lastSequence ?? ZERO) + BigInt(1)
  if (sequence > MAX_DATABASE_MINOR)
    conflict("Inventory valuation sequence exceeds its limit.")
  const resolvedUnknown =
    poolUnknown ??
    (sourceCostMinor === null ? sourceUnknownReason : null)

  return { valueBeforeMinor, valueAfterMinor, sequence, resolvedUnknown, movementCountExact }
}
