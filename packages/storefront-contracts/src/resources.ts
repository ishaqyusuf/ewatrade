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
export type StorefrontCapabilities = Record<StorefrontCapability, CapabilityState>
export type PublicAsset = { id: string; url: string; alt: string }

const availability = z.enum(["OUT_OF_STOCK", "MADE_TO_ORDER"]).nullable()
export const publicCatalogOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceMinor: z.number().int().nonnegative().nullable(),
  currencyCode: z.string(),
  availability,
}).strict()
export const publicCatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["PRODUCT", "SERVICE"]),
  description: z.string().nullable(),
  category: z.object({ id: z.string(), name: z.string() }).strict().nullable(),
  illustrationId: z.string(),
  photoUrl: z.string().optional(),
  currencyCode: z.string(),
  priceMinor: z.number().int().nonnegative().nullable(),
  isFromPrice: z.boolean(),
  availability,
  options: z.array(publicCatalogOptionSchema),
}).strict()
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
  }
  contact: {
    chatToken: string | null
    whatsAppPhone: string | null
    serviceRequestEntry?: { formId: string; offeringIds: readonly string[] }
  }
  assets: Record<string, PublicAsset>
}

export const catalogQuerySchema = z.object({
  category: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  item: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  after: z.string().regex(/^(?:[ao]:)?[A-Za-z0-9_-]{1,128}$/).optional(),
}).strict()
export type CatalogQuery = z.infer<typeof catalogQuerySchema>

export function storefrontQueryKey(scope: StorefrontScope, input: CatalogQuery = {}) {
  const query = catalogQuerySchema.parse(input)
  return ["storefront", scope.tenantId, scope.siteId, scope.storeId, scope.mode,
    scope.releaseId, scope.locale, scope.currencyCode,
    query.category ?? "", query.item ?? "", query.after ?? ""] as const
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
) => Promise<{ resources: StorefrontResources; capabilities: StorefrontCapabilities }>

export function unavailableCapabilities(reason = "Not available yet."): StorefrontCapabilities {
  const off = { available: false, reason }
  return { catalog: off, services: off, conversation: off, whatsappEnquiry: off, serviceRequest: off }
}
