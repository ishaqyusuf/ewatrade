import {
  catalogAiChoiceSchema,
  catalogAiFactsSchema,
} from "@ewatrade/utils/catalog-ai-images"
import { z } from "zod"
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
export const catalogAiContextSchema = z
  .object({
    storeId: id.optional(),
    contextKey: z.string().trim().min(1).max(128),
  })
  .strict()
export const catalogAiStartSchema = catalogAiContextSchema
  .extend({
    clientOperationId: z.string().uuid(),
    catalogItemId: id.optional(),
    sourceAssetId: id.optional(),
    facts: catalogAiFactsSchema,
    note: z.string().trim().max(500).default(""),
  })
  .strict()
export const catalogAiStartBatchSchema = catalogAiStartSchema
  .omit({ sourceAssetId: true })
  .extend({
    choices: z
      .array(catalogAiChoiceSchema)
      .min(1)
      .max(8)
      .refine(
        (choices) =>
          new Set(choices.map((choice) => choice.id)).size === choices.length,
        "Choose each customer choice once.",
      ),
  })
  .strict()
export const catalogAiCancelSchema = catalogAiContextSchema
  .extend({ jobIds: z.array(id).min(1).max(32) })
  .strict()
export const catalogAiVersionsSchema = z
  .object({ storeId: id.optional(), assetId: id })
  .strict()
export const catalogAiDeleteVersionSchema = catalogAiVersionsSchema
  .extend({
    clientOperationId: z.string().uuid(),
    expectedVersionAssetIds: z.array(id).min(1).max(100),
  })
  .strict()
