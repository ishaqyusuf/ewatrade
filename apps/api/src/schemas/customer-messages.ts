import { customerMessageEventKeySchema } from "@ewatrade/customer-messages"
import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const body = z
  .string()
  .min(1)
  .max(2_000)
  .refine(
    (value) => Array.from(value).length <= 1_000,
    "Keep saved wording within 1,000 characters.",
  )
/** Settings can edit another accessible Store; no value means the active one. */
const settingsStoreId = id.optional()
export const messageTemplateListSchema = z
  .object({ storeId: settingsStoreId })
  .strict()
  .optional()
const write = {
  storeId: settingsStoreId,
  eventKey: customerMessageEventKeySchema,
  scope: z.enum(["business", "store"]),
  expectedRevision: z.number().int().nonnegative(),
  expectedTemplateId: id.optional(),
}
export const messageTemplateSaveSchema = z
  .object({
    ...write,
    body,
    enabled: z.boolean().default(true),
    source: z.enum(["MANUAL", "AI_ASSISTED", "STARTER"]).default("MANUAL"),
  })
  .strict()
export const messageTemplateResetSchema = z.object(write).strict()
export const messageTemplateEnabledSchema = z
  .object({ ...write, enabled: z.boolean() })
  .strict()
const preview = {
  orderId: id,
  eventKey: customerMessageEventKeySchema.optional(),
  sourceId: id.optional(),
}
export const customerMessagePreviewSchema = z.object(preview).strict()
export const customerMessageOpenSchema = z
  .object({
    ...preview,
    previewVersion: z.string().regex(/^[a-f0-9]{64}$/),
    body: z
      .string()
      .min(1)
      .max(3_000)
      .refine(
        (value) => Array.from(value).length <= 1_500,
        "Keep the message within 1,500 characters.",
      ),
  })
  .strict()
export const customerMessageAiSchema = z
  .object({
    eventKeys: z
      .array(customerMessageEventKeySchema)
      .min(1)
      .max(8)
      .refine(
        (keys) => new Set(keys).size === keys.length,
        "Select each event once.",
      ),
    tone: z.enum(["friendly", "professional", "short"]).default("friendly"),
    language: z.enum(["en", "pcm"]).default("en"),
    instructions: z.string().trim().max(500).optional(),
  })
  .strict()
export type CustomerMessageAiInput = z.infer<typeof customerMessageAiSchema>
