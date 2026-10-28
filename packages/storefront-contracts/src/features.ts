import { z } from "zod"
import type { StorefrontComposition } from "./manifest"
import type { StorefrontCommerceResource } from "./resources"

export const storefrontFeatureConfigSchema = z
  .object({
    version: z.literal(1),
    accounts: z.object({ enabled: z.boolean() }).strict(),
    catalog: z
      .object({ showLowStockCounts: z.boolean() })
      .strict()
      .default({ showLowStockCounts: false }),
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
  return {
    version: 1,
    accounts: { enabled },
    catalog: { showLowStockCounts: legacyLowStockCountsEnabled(composition) },
    orders: { enabled: enabled && fulfilment.length > 0, fulfilment },
  }
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

/** Exact template pins whose header declares the low-stock count opt-in. */
const LOW_STOCK_COUNT_PINS: readonly { key: string; version: string }[] = [
  { key: "commerce-studio", version: "1.2.0" },
]
export const LOW_STOCK_COUNT_SETTING = "show-low-stock-count"

/**
 * Whether a composition (a published release or an authenticated Studio preview
 * design) explicitly opts in to exact low-stock counts. Only listed exact pins can,
 * only through their header setting set to `true`; anything else, including older
 * pins, malformed input or the default, keeps counts out of the public snapshot.
 */
function legacyLowStockCountsEnabled(composition: unknown) {
  const value = composition as {
    template?: { key?: unknown; version?: unknown }
    pages?: {
      sections?: {
        type?: unknown
        version?: unknown
        settings?: Record<string, unknown>
      }[]
    }[]
  } | null
  if (
    !LOW_STOCK_COUNT_PINS.some(
      (pin) =>
        pin.key === value?.template?.key &&
        pin.version === value?.template?.version,
    ) ||
    !Array.isArray(value?.pages)
  )
    return false
  // The same header the template and fulfilment policy read: the first one.
  const header = value.pages
    .flatMap((page) => (Array.isArray(page?.sections) ? page.sections : []))
    .find((entry) => entry?.type === "commerce-studio-header")
  return (
    header?.version === 2 && header.settings?.[LOW_STOCK_COUNT_SETTING] === true
  )
}

export function publicLowStockCountsEnabled(composition: unknown) {
  const version = (composition as { schemaVersion?: unknown } | null)
    ?.schemaVersion
  return version === 2
    ? readStorefrontFeatureConfig(composition)?.catalog.showLowStockCounts ===
        true
    : legacyLowStockCountsEnabled(composition)
}

/** Explicit unsaved draft migration. No release, persistence or authority is changed. */
export function withStorefrontFeatureConfig(
  current: StorefrontComposition,
  config: StorefrontFeatureConfig,
) {
  const next = {
    ...structuredClone(current),
    schemaVersion: 2 as const,
    features: storefrontFeatureConfigSchema.parse(config),
  }
  for (const page of next.pages)
    for (const section of page.sections) {
      if (section.type !== "commerce-studio-header") continue
      // Compatibility UI aliases mirror the one canonical configuration, never authorize it.
      if ("offer-pickup" in section.settings)
        section.settings["offer-pickup"] =
          next.features.orders.fulfilment.includes("pickup")
      if ("offer-delivery" in section.settings)
        section.settings["offer-delivery"] =
          next.features.orders.fulfilment.includes("delivery")
      if (LOW_STOCK_COUNT_SETTING in section.settings)
        section.settings[LOW_STOCK_COUNT_SETTING] =
          next.features.catalog.showLowStockCounts
    }
  return next
}

export function upgradeStorefrontFeatures(current: StorefrontComposition) {
  const config = readStorefrontFeatureConfig(current)
  if (!config)
    throw new Error("These storefront feature settings are unavailable.")
  return withStorefrontFeatureConfig(current, config)
}
