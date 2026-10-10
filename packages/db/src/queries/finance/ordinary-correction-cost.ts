import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { FinanceError } from "./rules"
import { calculateWeightedAverageIssue } from "./valuation-math"
const MAX_MINOR = BigInt("9223372036854775807")
export type CorrectionCost = Pick<
  Prisma.FinanceInventoryValuationEventGetPayload<{ include: { pool: true } }>,
  | "sourceCostMinor"
  | "valueBeforeMinor"
  | "valueDeltaMinor"
  | "valueAfterMinor"
  | "unknownReason"
>

/** Shared by posting and review; positive replacement stock has no trusted cost source. */
export function calculateOrdinaryCorrectionCost(input: {
  originalEffectNegative: boolean
  originalSourceCostMinor: bigint | null
  valueBeforeMinor: bigint | null
  unknownReason: FinanceInventoryUnknownReason | null
  inverseCanonicalBefore: string
  originalCanonical: string
  replacementEffect: string
  inverseAfterCanonical: string
  replacementCanonical: string
}) {
  const {
    originalEffectNegative,
    originalSourceCostMinor,
    valueBeforeMinor,
    unknownReason,
    inverseCanonicalBefore,
    originalCanonical,
    replacementEffect,
    inverseAfterCanonical,
    replacementCanonical,
  } = input
  const createInverseValue = (): CorrectionCost => {
    if (originalEffectNegative) {
      const restoredCost = originalSourceCostMinor
      if (restoredCost === null) {
        return {
          sourceCostMinor: null,
          valueBeforeMinor,
          valueDeltaMinor: null,
          valueAfterMinor: null,
          unknownReason: unknownReason ?? "PRIOR_UNKNOWN_COST",
        }
      }
      if (valueBeforeMinor === null) {
        return {
          sourceCostMinor: restoredCost,
          valueBeforeMinor: null,
          valueDeltaMinor: null,
          valueAfterMinor: null,
          unknownReason: unknownReason ?? "PRIOR_UNKNOWN_COST",
        }
      }
      const valueAfterMinor = valueBeforeMinor + restoredCost
      if (valueAfterMinor > MAX_MINOR)
        throw new FinanceError(
          "INVALID_AMOUNT",
          "Inventory value exceeds its limit.",
        )
      return {
        sourceCostMinor: restoredCost,
        valueBeforeMinor,
        valueDeltaMinor: restoredCost,
        valueAfterMinor,
        unknownReason: null,
      }
    }
    if (valueBeforeMinor === null) {
      return {
        sourceCostMinor: null,
        valueBeforeMinor: null,
        valueDeltaMinor: null,
        valueAfterMinor: null,
        unknownReason: unknownReason ?? "PRIOR_UNKNOWN_COST",
      }
    }
    const issue = calculateWeightedAverageIssue({
      quantityBefore: inverseCanonicalBefore,
      valueBeforeMinor,
      quantityIssued: originalCanonical,
    })
    return {
      sourceCostMinor: issue.valueIssuedMinor,
      valueBeforeMinor,
      valueDeltaMinor: -issue.valueIssuedMinor,
      valueAfterMinor: issue.valueAfterMinor,
      unknownReason: null,
    }
  }
  const inverseValue = createInverseValue()
  let replacementValue: CorrectionCost
  if (replacementEffect.startsWith("-")) {
    if (inverseValue.valueAfterMinor === null) {
      replacementValue = {
        sourceCostMinor: null,
        valueBeforeMinor: null,
        valueDeltaMinor: null,
        valueAfterMinor: null,
        unknownReason: inverseValue.unknownReason ?? "PRIOR_UNKNOWN_COST",
      }
    } else {
      const issue = calculateWeightedAverageIssue({
        quantityBefore: inverseAfterCanonical,
        valueBeforeMinor: inverseValue.valueAfterMinor,
        quantityIssued: replacementCanonical,
      })
      replacementValue = {
        sourceCostMinor: issue.valueIssuedMinor,
        valueBeforeMinor: inverseValue.valueAfterMinor,
        valueDeltaMinor: -issue.valueIssuedMinor,
        valueAfterMinor: issue.valueAfterMinor,
        unknownReason: null,
      }
    }
  } else {
    replacementValue = {
      sourceCostMinor: null,
      valueBeforeMinor: inverseValue.valueAfterMinor,
      valueDeltaMinor: null,
      valueAfterMinor: null,
      unknownReason: "UNCAPTURED_MOVEMENTS",
    }
  }

  return { inverseValue, replacementValue }
}
