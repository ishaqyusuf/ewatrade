import {
  compareExactDecimals,
  divideExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const reason = z.string().trim().min(1).max(500)
const quantity = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
  .refine((value) => /[1-9]/.test(value), "Quantity must be positive")

/**
 * Repack stock between two existing packaged-stock balances of the same
 * Product and variant in the active Store. Only the source quantity is
 * drafted; the server derives the exact target quantity from the pack
 * factors and never accepts one from the model.
 */
export const stockPackageTransformAction = z
  .object({
    action: z.literal("stock_package_transform"),
    sourceBalanceSourceId: id,
    targetBalanceSourceId: id,
    sourceQuantity: quantity,
    reason,
  })
  .strict()
export type StockPackageTransform = z.infer<typeof stockPackageTransformAction>

export type PackTargetInput = {
  sourceQuantity: string
  sourceFactor: string
  sourceScale: number
  targetFactor: string
  targetScale: number
  sourceUnitName: string
  targetUnitName: string
}
export type PackTargetResult =
  | {
      ok: true
      value: {
        sourceQuantity: string
        targetQuantity: string
        canonical: ReturnType<typeof multiplyExactDecimals>
      }
    }
  | { ok: false; refused: string }

/**
 * Exact source × sourceFactor ÷ targetFactor; no rounding or inventory authority.
 * Preserves the API's prior uncaught ExactDecimalError for an invalid saved source
 * factor/canonical multiplication. Callers must fail closed on that configuration.
 * Unit schemas and current server configuration/availability remain authoritative.
 */
export function derivePackTargetResult(
  input: PackTargetInput,
): PackTargetResult {
  let sourceQuantity: string
  try {
    sourceQuantity = parseExactDecimal(input.sourceQuantity, {
      allowZero: false,
      maxScale: input.sourceScale,
    })
  } catch {
    return {
      ok: false,
      refused: `${input.sourceQuantity} cannot be represented in ${input.sourceUnitName}.`,
    }
  }
  const canonical = multiplyExactDecimals(sourceQuantity, input.sourceFactor)
  let targetQuantity: string
  try {
    targetQuantity = divideExactDecimals(
      canonical,
      input.targetFactor,
      input.targetScale,
    )
  } catch {
    return {
      ok: false,
      refused:
        input.targetScale === 0
          ? `${sourceQuantity} ${input.sourceUnitName} does not make whole ${input.targetUnitName}.`
          : `${sourceQuantity} ${input.sourceUnitName} cannot be represented in ${input.targetUnitName}.`,
    }
  }
  if (compareExactDecimals(targetQuantity, "0") <= 0)
    return {
      ok: false,
      refused: `${sourceQuantity} ${input.sourceUnitName} does not make any ${input.targetUnitName}.`,
    }
  return { ok: true, value: { sourceQuantity, targetQuantity, canonical } }
}
