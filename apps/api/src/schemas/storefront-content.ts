import {
  storefrontContentContextSchema,
  storefrontContentDraftSchema,
  storefrontContentFieldLimit,
  storefrontContentTextSchema,
} from "@ewatrade/storefront-contracts/content"
import { z } from "zod"

const id = z.string().trim().min(1).max(128)
export const storefrontContentSiteSchema = z
  .object({ expectedSiteId: id })
  .strict()
export const storefrontContentIdSchema = storefrontContentSiteSchema
  .extend({ runId: id })
  .strict()
export const storefrontContentGenerateSchema = storefrontContentSiteSchema
  .extend({
    expectedDraftRevision: z.number().int().nonnegative(),
    clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
    composition: z.unknown(),
    pageKey: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    fieldIds: z
      .array(z.string().min(1).max(420))
      .min(1)
      .max(storefrontContentFieldLimit),
    context: storefrontContentContextSchema.optional(),
    instructions: storefrontContentTextSchema
      .pipe(z.string().trim().max(500))
      .default(""),
    previous: z
      .array(storefrontContentDraftSchema)
      .max(storefrontContentFieldLimit)
      .default([]),
  })
  .strict()
