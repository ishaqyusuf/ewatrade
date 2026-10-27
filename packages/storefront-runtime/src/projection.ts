import type {
  CatalogQuery,
  PublicCatalogItem,
  StorefrontCapabilities,
  StorefrontCommerceResource,
  StorefrontResources,
} from "../../storefront-contracts/src/resources"
import { storefrontDesignResources } from "./design-assets"

/** The existing public projection only; never pass a database row to a template. */
export type PublicStorefrontProjection = {
  name: string
  slug: string
  description: string | null
  currencyCode: string
  items: PublicCatalogItem[]
  highlightedItem: PublicCatalogItem | null
  categories: { id: string; name: string }[]
  category: string | null
  nextCursor: string | null
  hasHiddenItems: boolean
  query?: Pick<CatalogQuery, "q" | "availability" | "sort">
  chatToken: string | null
  whatsAppPhone: string | null
  serviceRequestEntry?: { formId: string; offeringIds: readonly string[] }
  offeringCounts?: { products: number; services: number }
  /** Prepared by the host from server facts; presentation only. */
  commerce?: StorefrontCommerceResource
}

/** Explicit projection keeps extra repository metadata out of client snapshots. */
export function publicStorefrontResources(store: PublicStorefrontProjection): {
  resources: StorefrontResources
  capabilities: StorefrontCapabilities
} {
  const items = [
    ...store.items,
    ...(store.highlightedItem ? [store.highlightedItem] : []),
  ]
  return {
    resources: {
      business: {
        name: store.name,
        slug: store.slug,
        description: store.description,
      },
      catalog: {
        items: store.items,
        highlightedItem: store.highlightedItem,
        categories: store.categories,
        category: store.category,
        nextCursor: store.nextCursor,
        hasHiddenItems: store.hasHiddenItems,
        ...(store.query ? { query: store.query } : {}),
        ...(store.offeringCounts
          ? { offeringCounts: store.offeringCounts }
          : {}),
      },
      contact: {
        chatToken: store.chatToken,
        whatsAppPhone: store.whatsAppPhone,
        ...(store.serviceRequestEntry
          ? { serviceRequestEntry: store.serviceRequestEntry }
          : {}),
      },
      assets: storefrontDesignResources(),
      ...(store.commerce ? { commerce: store.commerce } : {}),
    },
    capabilities: {
      catalog: { available: true },
      services: { available: items.some((item) => item.kind === "SERVICE") },
      conversation: { available: !!store.chatToken },
      whatsappEnquiry: { available: !!store.whatsAppPhone },
      serviceRequest: { available: !!store.serviceRequestEntry },
    },
  }
}
