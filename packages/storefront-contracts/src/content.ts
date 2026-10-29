import { z } from "zod"
import { type StorefrontComposition, compositionSchema } from "./manifest"

export const STOREFRONT_CONTENT_PROMPT_VERSION = "storefront-content-v1"
export const storefrontContentFieldLimit = 80
const id = z.string().min(1).max(420)
const pin = z
  .object({
    key: z.string().min(1).max(64),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
  })
  .strict()
const executable =
  /<\s*\/?\s*(?:script|iframe|object|embed|style)\b|javascript:|data:text\/html|\bon[a-z]+\s*=/i
const operational =
  /(?:[₦$€£]\s*\d|\b(?:NGN|USD|EUR|GBP)\s*\d|\b\d[\d.,]*\s*(?:NGN|USD|EUR|GBP)\b|\b(?:in stock|out of stock|five[- ]star|\d(?:\.\d)?\s*stars?|rated\s+\d|book now|booking confirmed|instant checkout|guaranteed|free delivery|same[- ]day delivery)\b)/i
export const storefrontContentTextSchema = z
  .string()
  .max(4000)
  .refine(
    (text) => !executable.test(text),
    "Use plain text without executable content.",
  )

/** Draft-only additions are explicit merchant input, never profile writes or authority. */
export const storefrontContentContextSchema = z
  .object({
    name: storefrontContentTextSchema.pipe(z.string().trim().min(1).max(240)),
    description: storefrontContentTextSchema.pipe(z.string().max(2000)),
    location: storefrontContentTextSchema.pipe(z.string().max(240)),
    offerings: storefrontContentTextSchema.pipe(z.string().max(2000)),
  })
  .strict()
export type StorefrontContentContext = z.infer<
  typeof storefrontContentContextSchema
>

export const storefrontContentProfileSummarySchema = z
  .object({
    template: pin,
    version: z.number().int().positive(),
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(800),
    voice: z.string().min(1).max(800),
  })
  .strict()
export type StorefrontContentProfileSummary = z.infer<
  typeof storefrontContentProfileSummarySchema
>
export const storefrontContentGuidanceSchema = z
  .object({
    sectionType: z.string().min(1).max(64),
    blockType: z.string().min(1).max(64).nullable(),
    key: z.string().min(1).max(64),
    label: z.string().min(1).max(120),
    purpose: z.string().min(1).max(800),
    minWords: z.number().int().min(1).max(400),
    maxWords: z.number().int().min(1).max(600),
    maxLength: z.number().int().min(1).max(4000),
    generation: z.enum(["draft", "manual"]),
  })
  .strict()
  .refine(
    (value) => value.minWords <= value.maxWords,
    "Invalid recommended word range.",
  )
export type StorefrontContentGuidance = z.infer<
  typeof storefrontContentGuidanceSchema
>
export type StorefrontContentProfile = StorefrontContentProfileSummary & {
  areas: StorefrontContentGuidance[]
}

export const storefrontContentFieldSchema = z
  .object({
    id,
    pageKey: z.string().min(1).max(64),
    sectionId: z.string().min(1).max(128),
    blockId: z.string().min(1).max(128).nullable(),
    key: z.string().min(1).max(64),
    label: z.string().min(1).max(120),
    sectionLabel: z.string().min(1).max(120),
    current: storefrontContentTextSchema,
    defaultValue: storefrontContentTextSchema,
    profile: pin,
    purpose: z.string().min(1).max(800),
    minWords: z.number().int().positive().max(400),
    maxWords: z.number().int().positive().max(600),
    maxLength: z.number().int().positive().max(4000),
  })
  .strict()
export type StorefrontContentField = z.infer<
  typeof storefrontContentFieldSchema
>

export const storefrontContentDraftSchema = z
  .object({ id, text: storefrontContentTextSchema })
  .strict()
export type StorefrontContentDraft = z.infer<
  typeof storefrontContentDraftSchema
>
export const storefrontContentBriefSchema = z
  .object({
    version: z.literal(1),
    baseRevision: z.number().int().nonnegative(),
    composition: compositionSchema,
    pageKey: z.string().min(1).max(64),
    context: storefrontContentContextSchema,
    contextOrigin: z.enum(["business", "merchant-draft"]),
    sources: z
      .array(
        z
          .object({
            reference: z.string().min(1).max(240),
            text: storefrontContentTextSchema,
          })
          .strict(),
      )
      .max(8),
    profiles: z.array(storefrontContentProfileSummarySchema).min(1).max(20),
    fields: z
      .array(storefrontContentFieldSchema)
      .min(1)
      .max(storefrontContentFieldLimit),
    instructions: storefrontContentTextSchema.pipe(z.string().trim().max(500)),
    previous: z
      .array(storefrontContentDraftSchema)
      .max(storefrontContentFieldLimit),
  })
  .strict()
export type StorefrontContentBrief = z.infer<
  typeof storefrontContentBriefSchema
>
export const storefrontContentOutputSchema = z
  .object({
    version: z.literal(1),
    fields: z
      .array(
        z
          .object({
            id,
            text: storefrontContentTextSchema.pipe(z.string().trim().min(1)),
            sourceReferences: z.array(z.string().min(1).max(240)).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(storefrontContentFieldLimit),
  })
  .strict()
export type StorefrontContentOutput = z.infer<
  typeof storefrontContentOutputSchema
>

export function storefrontContentWordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/u).length : 0
}
export function storefrontContentFieldState(
  field: Pick<StorefrontContentField, "minWords" | "maxWords" | "maxLength">,
  text: string,
) {
  const words = storefrontContentWordCount(text)
  const parsed = storefrontContentTextSchema.safeParse(text)
  return {
    words,
    valid:
      parsed.success &&
      text.trim().length > 0 &&
      text.length <= field.maxLength,
    outsideRange: words < field.minWords || words > field.maxWords,
  }
}

/** Exact selected fields once each. A model can return text, never structural edits. */
export function validateStorefrontContentOutput(
  value: unknown,
  brief: StorefrontContentBrief,
): StorefrontContentOutput {
  const output = storefrontContentOutputSchema.parse(value)
  if (output.fields.length !== brief.fields.length)
    throw new Error("The content response omitted selected areas.")
  const seen = new Set<string>()
  const sources = new Set(brief.sources.map((source) => source.reference))
  for (const result of output.fields) {
    const field = brief.fields.find((entry) => entry.id === result.id)
    if (!field || seen.has(result.id))
      throw new Error(
        "The content response named an unavailable or repeated area.",
      )
    seen.add(result.id)
    if (!storefrontContentFieldState(field, result.text).valid)
      throw new Error("The content response exceeded a field limit.")
    if (operational.test(result.text))
      throw new Error(
        "Generated content cannot assert prices, stock, ratings or unsupported operational promises.",
      )
    if (result.sourceReferences.some((reference) => !sources.has(reference)))
      throw new Error("The content response cited an unavailable fact.")
  }
  return output
}

/** Local review apply: the exact draft snapshot must still match, including other edits. */
export function applyStorefrontContent(input: {
  current: StorefrontComposition
  base: StorefrontComposition
  fields: readonly StorefrontContentField[]
  drafts: readonly StorefrontContentDraft[]
}): StorefrontComposition {
  if (JSON.stringify(input.current) !== JSON.stringify(input.base))
    throw new Error(
      "Your draft changed. Generate content from the current draft before applying it.",
    )
  if (!input.drafts.length) throw new Error("Choose at least one content area.")
  const next = structuredClone(input.current)
  const seen = new Set<string>()
  for (const result of input.drafts) {
    const field = input.fields.find((entry) => entry.id === result.id)
    if (
      !field ||
      seen.has(result.id) ||
      !storefrontContentFieldState(field, result.text).valid
    )
      throw new Error("Choose valid content within each field's limit.")
    seen.add(result.id)
    const section = next.pages
      .find((page) => page.key === field.pageKey)
      ?.sections.find((entry) => entry.id === field.sectionId)
    const settings = field.blockId
      ? section?.blocks.find((block) => block.id === field.blockId)?.settings
      : section?.settings
    if (!settings || settings[field.key] !== field.current)
      throw new Error(
        "That content area changed. Start from the current draft.",
      )
    settings[field.key] = result.text
  }
  return next
}

export function storefrontContentContextSources(
  context: StorefrontContentContext,
) {
  return Object.entries(context)
    .filter(([, text]) => text.trim())
    .map(([key, text]) => ({ reference: `context.${key}`, text }))
}
