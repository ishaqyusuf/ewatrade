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
export const CATALOG_ILLUSTRATIONS: readonly CatalogIllustration[] =
  Object.freeze(
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

/** Words saying how an item is packed or sold, rarely what it is. */
const UNIT_WORDS = new Set([
  "bag",
  "bottle",
  "box",
  "bucket",
  "can",
  "carton",
  "crate",
  "jug",
  "pack",
  "packet",
  "piece",
  "roll",
  "sack",
  "tin",
  "tray",
  "tube",
])

const IGNORED_WORDS = new Set([
  "a",
  "an",
  "and",
  "big",
  "each",
  "for",
  "fresh",
  "in",
  "large",
  "medium",
  "my",
  "new",
  "of",
  "old",
  "on",
  "our",
  "per",
  "small",
  "the",
  "with",
])

/** Light English stemming, applied alike to item names and the library. */
function stem(word: string) {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3)
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`
  if (word.length > 4 && word.endsWith("oes")) return word.slice(0, -2)
  if (word.length > 4 && /(ss|x|z|ch|sh)es$/.test(word))
    return word.slice(0, -2)
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss"))
    return word.slice(0, -1)
  return word
}

function words(value: string) {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stem)
}

/**
 * The library illustration that best fits an item's name, or null. At least
 * one word that names the thing itself must match ("Crate of eggs" -> Egg);
 * packaging words alone ("Bag of rice") never pick a picture. Category, then
 * business profile, break ties; the generic illustration is never chosen.
 */
export function recommendCatalogIllustration(input: {
  name: string
  kind: CatalogSetupHelperKind
  businessProfileKey?: string | null
  categoryKey?: string | null
}) {
  const nameWords = new Set(
    words(input.name).filter((word) => !IGNORED_WORDS.has(word)),
  )
  const category = input.categoryKey ?? ""
  let best: { illustration: CatalogIllustration; score: number } | null = null
  for (const illustration of CATALOG_ILLUSTRATIONS) {
    if (
      illustration.id === "ill-generic-product" ||
      !illustration.itemKinds.includes(input.kind)
    )
      continue
    const own = new Set(
      words([illustration.label, ...illustration.searchTags].join(" ")),
    )
    let strong = 0
    let weak = 0
    for (const word of nameWords) {
      if (!own.has(word)) continue
      if (UNIT_WORDS.has(word)) weak += 1
      else strong += 1
    }
    if (strong === 0) continue
    const categoryMatch =
      Boolean(category) &&
      illustration.categoryKeys.some(
        (key) => key === category || key.startsWith(`${category}:`),
      )
    const profileMatch = illustration.businessProfileKeys.includes(
      input.businessProfileKey ?? "",
    )
    const score =
      strong * 10 + weak * 3 + (categoryMatch ? 4 : 0) + (profileMatch ? 2 : 0)
    if (!best || score > best.score) best = { illustration, score }
  }
  return best?.illustration ?? null
}
