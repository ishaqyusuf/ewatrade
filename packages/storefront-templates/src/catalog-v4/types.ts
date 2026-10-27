import type {
  CatalogQuery,
  PublicCatalogItem,
} from "../../../storefront-contracts/src/resources"

/** Public snapshot the Catalog v4 renderer reads. Host projections satisfy it structurally; no DB types here. */
export type CatalogV4Item = PublicCatalogItem & { photoUrl?: string }
export type CatalogV4Store = {
  name: string
  slug: string
  description: string | null
  categories: readonly { id: string; name: string }[]
  category: string | null
  items: CatalogV4Item[]
  highlightedItem: CatalogV4Item | null
  nextCursor: string | null
  hasHiddenItems: boolean
  /** Server-applied listing state; the renderer only echoes it into controls and links. */
  query?: Pick<CatalogQuery, "q" | "availability" | "sort">
  chatToken: string | null
  whatsAppPhone: string | null
  serviceRequestEntry?: { formId: string; offeringIds: readonly string[] }
  isQaPreview?: boolean
  isDraftPreview?: boolean
}
