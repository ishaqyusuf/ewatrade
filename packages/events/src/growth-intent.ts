import { z } from "zod"
import type { EventMetadata } from "./event-metadata"

// Lifecycle marketing intent events (docs/plans/2026-11-12-lifecycle-marketing-plan.md §5.1).
// Fixed labels only: no ids, amounts, names or free text ever enter these events.

/** Which locked feature or limit sent the person towards plans. */
export const GROWTH_INTENT_FEATURES = [
  "plan_billing",
  "attachments",
  "payment_alerts",
  "staff",
  "businesses",
  "stores",
  "products",
  "orders",
  "storefront",
  "custom_domain",
  "whatsapp",
  "telegram",
  "home",
] as const
export type GrowthIntentFeature = (typeof GROWTH_INTENT_FEATURES)[number]

/** Where the prompt sat on screen. Sent as the whitelisted `action` field. */
export const GROWTH_INTENT_PLACEMENTS = [
  "lock_sheet",
  "limit_card",
  "inline_link",
  "plan_page",
  "home_card",
  "banner",
] as const
export type GrowthIntentPlacement = (typeof GROWTH_INTENT_PLACEMENTS)[number]

const feature = z.enum(GROWTH_INTENT_FEATURES)
const placement = z.enum(GROWTH_INTENT_PLACEMENTS)
const surface = z.enum(["dashboard", "mobile"])
/** Play ids are code constants, e.g. `P04_site_setup` or `P08_limit:products`. */
const play = z.string().regex(/^P\d{2}_[a-z0-9_]{1,40}(:[a-z0-9_]{1,24})?$/)
const plan = z.enum(["free", "starter", "growth", "pro"])

export const growthIntentInputSchema = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("plan_sheet_opened"),
      surface,
      feature,
      placement,
    })
    .strict(),
  z
    .object({
      name: z.literal("upgrade_cta_clicked"),
      surface,
      feature,
      placement,
      plan: plan.optional(),
    })
    .strict(),
  z
    .object({ name: z.literal("nudge_shown"), surface, play, placement })
    .strict(),
  z
    .object({ name: z.literal("nudge_dismissed"), surface, play, placement })
    .strict(),
])
export type GrowthIntentInput = z.infer<typeof growthIntentInputSchema>
export type GrowthIntentName = GrowthIntentInput["name"]

/**
 * Maps an intent to whitelisted metadata. Invalid input drops the event
 * instead of copying arbitrary text.
 */
export function growthIntentEvent(
  input: unknown,
): { name: GrowthIntentName; properties: EventMetadata } | null {
  const parsed = growthIntentInputSchema.safeParse(input)
  if (!parsed.success) return null
  const event = parsed.data
  const base = { surface: event.surface, action: event.placement }
  switch (event.name) {
    case "plan_sheet_opened":
      return {
        name: event.name,
        properties: { ...base, feature: event.feature },
      }
    case "upgrade_cta_clicked":
      return {
        name: event.name,
        properties: {
          ...base,
          feature: event.feature,
          ...(event.plan ? { category: event.plan } : {}),
        },
      }
    case "nudge_shown":
    case "nudge_dismissed":
      return { name: event.name, properties: { ...base, category: event.play } }
  }
}

/**
 * A "See plans" tap on a locked feature. These are what the server-side
 * per-business counter records for the feature-intent play (W3).
 */
export function isSeePlansTap(input: GrowthIntentInput) {
  return (
    input.name === "upgrade_cta_clicked" &&
    input.feature !== "plan_billing" &&
    input.placement !== "plan_page"
  )
}
