import { z } from "zod"
import type { StorefrontCommerceResource } from "./resources"

export const storefrontFeatureConfigSchema = z
  .object({
    version: z.literal(1),
    accounts: z.object({ enabled: z.boolean() }).strict(),
    orders: z
      .object({
        enabled: z.boolean(),
        fulfilment: z.array(z.enum(["pickup", "delivery"])).max(2),
      })
      .strict(),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.orders.fulfilment).size === value.orders.fulfilment.length,
    "Fulfilment methods must be unique.",
  )

export type StorefrontFeatureConfig = z.infer<
  typeof storefrontFeatureConfigSchema
>

const legacyShape = z
  .object({
    schemaVersion: z.literal(1),
    template: z.object({ key: z.string(), version: z.string() }),
    pages: z.array(
      z
        .object({
          sections: z.array(
            z
              .object({
                type: z.string(),
                settings: z.record(z.string(), z.unknown()),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough()

/** Legacy normalization never mutates a draft/release or grants a new feature. */
export function readStorefrontFeatureConfig(
  composition: unknown,
): StorefrontFeatureConfig | null {
  if (!composition || typeof composition !== "object") return null
  const value = composition as { schemaVersion?: unknown; features?: unknown }
  if (value.schemaVersion === 2) {
    const checked = storefrontFeatureConfigSchema.safeParse(value.features)
    return checked.success ? checked.data : null
  }
  // A feature field cannot smuggle a new policy into a legacy composition.
  if ("features" in value) return null
  const parsed = legacyShape.safeParse(composition)
  if (!parsed.success) return null
  const enabled = parsed.data.template.key === "commerce-studio"
  const header = parsed.data.pages
    .flatMap((page) => page.sections)
    .find((section) => section.type === "commerce-studio-header")
  const fulfilment: StorefrontFeatureConfig["orders"]["fulfilment"] = []
  if (header?.settings["offer-pickup"] !== false) fulfilment.push("pickup")
  if (header?.settings["offer-delivery"] === true) fulfilment.push("delivery")
  return { version: 1, accounts: { enabled }, orders: { enabled, fulfilment } }
}

/** Rendering hints only. Each domain operation independently rechecks authority. */
export function storefrontCommerceAvailability(
  config: StorefrontFeatureConfig,
  facts: {
    requestsEntitled: boolean
    products: number
    channels: readonly ("email" | "whatsapp")[]
    hasContact: boolean
  },
): StorefrontCommerceResource {
  const ordering =
    facts.requestsEntitled &&
    config.orders.enabled &&
    facts.products > 0 &&
    config.orders.fulfilment.length > 0
  const accounts =
    facts.requestsEntitled &&
    config.accounts.enabled &&
    facts.channels.length > 0
  return {
    orderRequests: ordering
      ? { available: true }
      : { available: false, reason: "Not taking order requests." },
    customerAccounts: accounts
      ? { available: true, channels: facts.channels }
      : { available: false, reason: "Login isn't available.", channels: [] },
    fulfilment: config.orders.fulfilment,
    hasContact: facts.hasContact,
  }
}
