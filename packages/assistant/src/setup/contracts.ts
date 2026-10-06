import { findCatalogCategoryPreset } from "@ewatrade/utils/catalog-category-presets"
import { findCatalogSetupHelper } from "@ewatrade/utils/catalog-setup-helpers"
import { isExactDecimal } from "@ewatrade/utils/exact-decimal"
import { z } from "zod"

export const SETUP_ASSISTANT_PROMPT_VERSION = "ewatrade-setup-assistant-v1"
export const SETUP_DRAFT_MAX_ENTITIES = 200

/** Model-facing money is a major-unit decimal; storage is integer minor units. */
export function majorAmountToMinor(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null
  const normalized = String(value)
    .replace(/[\s,]/g, "")
    .replace(/^[^\d.-]+/, "")
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(normalized)
  if (!match) return null
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? "").padEnd(2, "0"))
  return whole * 100 + fraction
}

export function normalizeQuantity(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) return null
  const normalized = String(value).replace(/[\s,]/g, "")
  return isExactDecimal(normalized, { maxScale: 6 }) &&
    !normalized.startsWith("-")
    ? normalized
    : null
}

export function setupEntityKey(kind: string, name: string) {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${kind}:${slug || "item"}`
}

const name = z.string().trim().min(1).max(160)
const shortText = z.string().trim().max(500)

export const setupFollowUpFieldSchema = z.enum([
  "price",
  "stock",
  "unit",
  "photo",
  "category",
  "phone",
  "balance",
  "other",
])
export type SetupFollowUpField = z.infer<typeof setupFollowUpFieldSchema>

export const setupOpenQuestionSchema = z.object({
  field: setupFollowUpFieldSchema,
  question: z.string().trim().min(1).max(240),
  required: z.boolean(),
})
export type SetupOpenQuestion = z.infer<typeof setupOpenQuestionSchema>

export const setupProductPayloadSchema = z
  .object({
    kind: z.literal("product"),
    name,
    description: shortText.optional(),
    unitName: z.string().trim().min(1).max(80),
    priceMinor: z.number().int().min(0).max(100_000_000).optional(),
    openingStock: z.string().optional(),
    categoryKey: z.string().max(120).optional(),
    quickSetupKey: z.string().max(120).optional(),
    sellingUnits: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          containsQuantity: z.string(),
          priceMinor: z.number().int().min(0).max(100_000_000).optional(),
        }),
      )
      .max(5)
      .optional(),
    options: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          values: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
        }),
      )
      .max(3)
      .optional(),
    usage: z.enum(["FOR_SALE", "INTERNAL_USE", "BOTH"]).optional(),
  })
  .strict()

export const setupServicePayloadSchema = z
  .object({
    kind: z.literal("service"),
    name,
    description: shortText.optional(),
    pricing: z.enum(["fixed", "quote"]),
    priceMinor: z.number().int().min(0).max(100_000_000).optional(),
    categoryKey: z.string().max(120).optional(),
    quickSetupKey: z.string().max(120).optional(),
  })
  .strict()

export const setupCustomerPayloadSchema = z
  .object({
    kind: z.literal("customer"),
    name,
    phone: z.string().trim().min(3).max(40).optional(),
    email: z.string().trim().email().max(254).optional(),
    opening: z
      .object({
        direction: z.enum(["owes_business", "business_owes"]),
        amountMinor: z.number().int().min(1).max(10_000_000_000),
      })
      .optional(),
  })
  .strict()

export const setupEntityPayloadSchema = z.discriminatedUnion("kind", [
  setupProductPayloadSchema,
  setupServicePayloadSchema,
  setupCustomerPayloadSchema,
])
export type SetupEntityPayload = z.infer<typeof setupEntityPayloadSchema>
export type SetupProductPayload = z.infer<typeof setupProductPayloadSchema>
export type SetupServicePayload = z.infer<typeof setupServicePayloadSchema>
export type SetupCustomerPayload = z.infer<typeof setupCustomerPayloadSchema>

export const setupEntitySourceSchema = z.object({
  messageId: z.string().max(80).nullable(),
  quote: z.string().max(240).optional(),
})
export type SetupEntitySource = z.infer<typeof setupEntitySourceSchema>

/** Unknown vocabulary keys are dropped rather than invented. */
export function sanitizeVocabulary<T extends object>(payload: T) {
  const warnings: string[] = []
  const next = { ...payload } as T & {
    categoryKey?: string
    quickSetupKey?: string
  }
  if (next.categoryKey) {
    const key = next.categoryKey.replace(/^preset:/, "")
    const preset = findCatalogCategoryPreset(key.split(":")[0])
    if (
      !preset ||
      (key !== preset.key &&
        !preset.subcategories.some((entry) => entry.key === key))
    ) {
      warnings.push(`Unknown category ${next.categoryKey} was ignored.`)
      next.categoryKey = undefined
    }
  }
  if (next.quickSetupKey && !findCatalogSetupHelper(next.quickSetupKey)) {
    warnings.push(`Unknown quick setup ${next.quickSetupKey} was ignored.`)
    next.quickSetupKey = undefined
  }
  return { payload: next as T, warnings }
}

/**
 * Required facts decide whether an entity can be confirmed. Optional follow-ups
 * (stock, photo, category) are asked but never block the owner.
 */
export function deriveSetupEntityState(
  payload: SetupEntityPayload,
  questions: SetupOpenQuestion[],
): { state: "NEEDS_INPUT" | "PROPOSED"; questions: SetupOpenQuestion[] } {
  const derived: SetupOpenQuestion[] = []
  if (payload.kind === "product" && payload.priceMinor === undefined)
    derived.push({
      field: "price",
      question: `What is your selling price for one ${payload.unitName.toLowerCase()} of ${payload.name}?`,
      required: true,
    })
  if (
    payload.kind === "service" &&
    payload.pricing === "fixed" &&
    payload.priceMinor === undefined
  )
    derived.push({
      field: "price",
      question: `How much do you charge for ${payload.name}?`,
      required: true,
    })
  const merged = [
    ...derived,
    ...questions.filter(
      (question) =>
        !derived.some((entry) => entry.field === question.field) &&
        !answered(payload, question.field),
    ),
  ]
  return {
    state: merged.some((question) => question.required)
      ? "NEEDS_INPUT"
      : "PROPOSED",
    questions: merged,
  }
}

function answered(payload: SetupEntityPayload, field: SetupFollowUpField) {
  switch (field) {
    case "price":
      return payload.kind !== "customer" && payload.priceMinor !== undefined
    case "stock":
      return payload.kind === "product" && payload.openingStock !== undefined
    case "category":
      return payload.kind !== "customer" && payload.categoryKey !== undefined
    case "phone":
      return payload.kind === "customer" && payload.phone !== undefined
    case "balance":
      return payload.kind === "customer" && payload.opening !== undefined
    default:
      return false
  }
}

export function setupEntityKind(payload: SetupEntityPayload) {
  return payload.kind === "product"
    ? ("PRODUCT" as const)
    : payload.kind === "service"
      ? ("SERVICE" as const)
      : ("CUSTOMER" as const)
}
