import {
  EXACT_FACTOR_MAX_SCALE,
  compareExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { z } from "zod"
const id = z.string().trim().min(1).max(128)
const unit = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i),
    name: z.string().trim().min(1).max(80),
    factor: z
      .string()
      .trim()
      .max(64)
      .superRefine((value, ctx) => {
        try {
          parseExactDecimal(value, {
            allowZero: false,
            maxScale: EXACT_FACTOR_MAX_SCALE,
          })
        } catch {
          ctx.addIssue({
            code: "custom",
            message: "Use a positive exact unit factor.",
          })
        }
      }),
    stockBehavior: z.enum([
      "canonical_shared",
      "alternate_transaction",
      "packaged_stock",
    ]),
    transactionScale: z.number().int().min(0).max(6),
    symbol: z.string().trim().min(1).max(24).optional(),
    unitDefinitionId: id.optional(),
  })
  .strict()
export const unitConfigurationDraftAction = z
  .object({
    action: z.literal("product_unit_configuration_draft"),
    catalogItemId: id,
    canonicalBalanceScale: z.number().int().min(0).max(18),
    units: z.array(unit).min(1).max(48),
  })
  .strict()
  .superRefine((value, ctx) => {
    const keys = value.units.map((unit) => unit.key.toLowerCase())
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: "custom", message: "Unit keys must be unique." })
    const canonical = value.units.filter(
      (unit) => unit.stockBehavior === "canonical_shared",
    )
    let validMain = false
    try {
      validMain =
        canonical.length === 1 &&
        compareExactDecimals(canonical[0]?.factor ?? "0", "1") === 0
    } catch {
      /* The factor field reports malformed decimals. */
    }
    if (!validMain)
      ctx.addIssue({
        code: "custom",
        message: "Choose exactly one main unit with factor 1.",
      })
  })
export const unitConfigurationPublishAction = z
  .object({
    action: z.literal("product_unit_configuration_publish"),
    catalogItemId: id,
    stockTransitionOperationId: id.optional(),
  })
  .strict()
