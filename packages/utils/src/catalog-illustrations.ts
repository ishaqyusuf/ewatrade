import illustrationFile from "./catalog-illustrations.json"
import type { CatalogSetupHelperKind } from "./catalog-setup-helpers"

export type CatalogIllustration = {
  readonly id: string
  readonly label: string
  readonly primaryBusinessProfileKey: string
  readonly businessProfileKeys: readonly string[]
  readonly categoryKeys: readonly string[]
  readonly itemKinds: readonly CatalogSetupHelperKind[]
  readonly searchTags: readonly string[]
  readonly customServiceContext: boolean
}

// Metadata only: artwork and theme paints belong to the renderer, not suggestions.
export const CATALOG_ILLUSTRATIONS: readonly CatalogIllustration[] = Object.freeze(
  illustrationFile.assets.map((asset) =>
    Object.freeze({
      ...asset,
      businessProfileKeys: Object.freeze([...asset.businessProfileKeys]),
      categoryKeys: Object.freeze([...asset.categoryKeys]),
      itemKinds: Object.freeze(
        asset.itemKinds.filter(
          (kind): kind is CatalogSetupHelperKind =>
            kind === "product" || kind === "service",
        ),
      ),
      searchTags: Object.freeze([...asset.searchTags]),
    }),
  ),
)

const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase()

export function findCatalogIllustration(id: string | null | undefined) {
  return CATALOG_ILLUSTRATIONS.find((illustration) => illustration.id === id)
}

export function getCatalogIllustrations({
  businessProfileKey,
  categoryKey,
  kind,
  query = "",
  all = false,
}: {
  businessProfileKey?: string | null
  categoryKey?: string | null
  kind: CatalogSetupHelperKind
  query?: string
  all?: boolean
}) {
  const terms = normalize(query).split(" ").filter(Boolean)
  const profile = businessProfileKey ?? ""
  const category = categoryKey ?? ""
  const knownProfile = CATALOG_ILLUSTRATIONS.some((illustration) =>
    illustration.businessProfileKeys.includes(profile),
  )
  const ranked = CATALOG_ILLUSTRATIONS.map((illustration, order) => {
    const kindMatch = illustration.itemKinds.includes(kind)
    const profileMatch = illustration.businessProfileKeys.includes(profile)
    const categoryMatch =
      Boolean(category) &&
      illustration.categoryKeys.some(
        (key) => key === category || key.startsWith(`${category}:`),
      )
    const searchable = normalize(
      [illustration.label, ...illustration.searchTags].join(" "),
    )
    return {
      illustration,
      order,
      matchesSearch: terms.every((term) => searchable.includes(term)),
      recommended:
        kindMatch &&
        (categoryMatch ||
          profileMatch ||
          !knownProfile ||
          profile === "other-mixed-business"),
      score:
        (categoryMatch ? 8 : 0) + (kindMatch ? 4 : 0) + (profileMatch ? 2 : 0),
    }
  })
  // Business/kind suggestions rank assets; they never hide the rest of the library.
  return ranked
    .filter((entry) => entry.matchesSearch)
    .sort((left, right) =>
      all
        ? left.order - right.order
        : right.score - left.score || left.order - right.order,
    )
    .map(({ illustration, recommended }) => ({ illustration, recommended }))
}
