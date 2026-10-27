import { z } from "zod"
import type { StorefrontCapability } from "./manifest"

export type StorefrontMode = "live" | "preview"

/** Created by trusted host/session loaders, never accepted as authorization input. */
export type StorefrontScope = {
  tenantId: string
  siteId: string
  storeId: string
  releaseId: string
  mode: StorefrontMode
  locale: string
  currencyCode: string
}
export type CapabilityState = { available: boolean; reason?: string }
export type StorefrontCapabilities = Record<
  StorefrontCapability,
  CapabilityState
>
export type PublicAsset = { id: string; url: string; alt: string }

const availability = z.enum(["OUT_OF_STOCK", "MADE_TO_ORDER"]).nullable()
/**
 * Coarse public stock fact for one product option. `unknown` means no tracked
 * balance exists: it must never be presented as confirmed stock. Quantities stay private.
 */
export const publicStockStateSchema = z.enum([
  "in_stock",
  "low_stock",
  "out_of_stock",
  "unknown",
])
export type PublicStockState = z.infer<typeof publicStockStateSchema>
export const publicCatalogOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    priceMinor: z.number().int().nonnegative().nullable(),
    currencyCode: z.string(),
    availability,
    /** Products only. Absent for services and older loaders. */
    stock: publicStockStateSchema.optional(),
    /** Selling unit and allowed decimal places for quantity entry. */
    unit: z
      .object({
        /** Merchant unit name; null when the business has not named one. */
        label: z.string().min(1).max(40).nullable(),
        scale: z.number().int().min(0).max(6),
      })
      .strict()
      .optional(),
    /** Services only: merchant-entered typical duration. */
    durationMinutes: z.number().int().positive().nullable().optional(),
  })
  .strict()
export const publicCatalogItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(["PRODUCT", "SERVICE"]),
    description: z.string().nullable(),
    category: z
      .object({ id: z.string(), name: z.string() })
      .strict()
      .nullable(),
    illustrationId: z.string(),
    photoUrl: z.string().optional(),
    currencyCode: z.string(),
    priceMinor: z.number().int().nonnegative().nullable(),
    isFromPrice: z.boolean(),
    availability,
    options: z.array(publicCatalogOptionSchema),
  })
  .strict()
export type PublicCatalogItem = z.infer<typeof publicCatalogItemSchema>

export type StorefrontResources = {
  business: { name: string; slug: string; description: string | null }
  catalog: {
    items: PublicCatalogItem[]
    highlightedItem: PublicCatalogItem | null
    categories: { id: string; name: string }[]
    category: string | null
    nextCursor: string | null
    hasHiddenItems: boolean
    /** Listing state only; item/after stay navigation hints, never resource authority. */
    query?: Pick<CatalogQuery, "q" | "availability" | "sort">
    /**
     * Eligible public offerings across the whole Store (not just this page). Templates
     * use it to choose Shop/Services presentation; history never decides the mode.
     */
    offeringCounts?: { products: number; services: number }
  }
  contact: {
    chatToken: string | null
    whatsAppPhone: string | null
    serviceRequestEntry?: { formId: string; offeringIds: readonly string[] }
  }
  assets: Record<string, PublicAsset>
  /**
   * Presentation hints for the storefront commerce routes. The server re-derives
   * every fact before any write; these flags never authorize anything.
   */
  commerce?: StorefrontCommerceResource
}

export type StorefrontCommerceResource = {
  /** Product order requests (cart → pending request awaiting business review). */
  orderRequests: CapabilityState
  /** Optional customer login. Guest ordering never depends on it. */
  customerAccounts: CapabilityState & {
    channels: readonly ("email" | "whatsapp")[]
  }
  /** Fulfilment methods the business offers for product requests. */
  fulfilment: readonly ("pickup" | "delivery")[]
  /** Business has a public contact for follow-up (never the number itself here). */
  hasContact: boolean
}

export const catalogQuerySchema = z
  .object({
    category: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    item: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    after: z
      .string()
      .regex(/^(?:(?:[ao]:)?[A-Za-z0-9_-]{1,128}|s:[A-Za-z0-9_-]{1,1536})$/)
      .optional(),
    q: z.string().trim().max(120).optional(),
    availability: z
      .union([
        z.enum(["available", "out_of_stock"]),
        z.literal("").transform(() => undefined),
      ])
      .optional(),
    sort: z
      .union([
        z.enum(["name_asc", "name_desc", "price_asc", "price_desc"]),
        z.literal("").transform(() => undefined),
      ])
      .optional(),
  })
  .strict()
export type CatalogQuery = z.infer<typeof catalogQuerySchema>

export function storefrontQueryKey(
  scope: StorefrontScope,
  input: CatalogQuery = {},
) {
  const query = catalogQuerySchema.parse(input)
  return [
    "storefront",
    scope.tenantId,
    scope.siteId,
    scope.storeId,
    scope.mode,
    scope.releaseId,
    scope.locale,
    scope.currencyCode,
    query.category ?? "",
    query.item ?? "",
    query.after ?? "",
    query.q ?? "",
    query.availability ?? "",
    query.sort ?? "",
  ] as const
}

export function sectionResources(
  resources: StorefrontResources,
  resource: "business" | "publicCatalog" | "publicServices",
) {
  if (resource === "business") return resources.business
  if (resource === "publicServices") {
    return resources.catalog.items.filter((item) => item.kind === "SERVICE")
  }
  return resources.catalog
}

/** Hard caps for one render; loaders page beyond these instead of loading everything. */
export const STOREFRONT_RESOURCE_LIMITS = {
  catalogItems: 50,
  categories: 50,
  optionsPerItem: 20,
  assets: 64,
} as const

/**
 * Implemented by the host from existing public commerce/channel queries.
 * Scope is derived on the server from host + session; templates only receive results.
 * Sections bind by item/asset ID; prices and stock always come from this load, never copied into settings.
 */
export type StorefrontResourceLoader = (
  scope: StorefrontScope,
  query: CatalogQuery,
) => Promise<{
  resources: StorefrontResources
  capabilities: StorefrontCapabilities
}>

export function unavailableCapabilities(
  reason = "Not available yet.",
): StorefrontCapabilities {
  const off = { available: false, reason }
  return {
    catalog: off,
    services: off,
    conversation: off,
    whatsappEnquiry: off,
    serviceRequest: off,
  }
}
