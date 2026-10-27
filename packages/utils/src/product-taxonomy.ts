import attributeRows from "./product-taxonomy/attributes.json"
/** Server-side reference index. Import this subpath only in server orchestration;
 * clients receive the selected label and bounded candidates, never the full index.
 */
import categoryRows from "./product-taxonomy/categories.json"
import manifest from "./product-taxonomy/manifest.json"

type CategoryRow = [
  id: string,
  name: string,
  parent: string | null,
  attributes: string[],
]
type AttributeRow = [
  id: string,
  name: string,
  handle: string,
  description: string,
]
const categories = categoryRows as CategoryRow[]
const attributes = attributeRows as AttributeRow[]
const byId = new Map(categories.map((row) => [row[0], row]))
const attributesById = new Map(attributes.map((row) => [row[0], row]))
const normalize = (text: string) =>
  text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\bt[ -]?shirts?\b/g, "t shirt")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
const words = (text: string) =>
  normalize(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word.length > 3 ? word.replace(/ies$/, "y").replace(/s$/, "") : word,
    )
function pathFor(row: CategoryRow): string[] {
  const path: string[] = []
  let current: CategoryRow | undefined = row
  const seen = new Set<string>()
  while (current && !seen.has(current[0])) {
    seen.add(current[0])
    path.unshift(current[1])
    current = current[2] ? byId.get(current[2]) : undefined
  }
  return path
}
const indexed = categories.map((row) => ({
  row,
  path: pathFor(row),
  tokens: words(row[1]),
}))
const labels = new Map(
  indexed.map((entry) => [entry.path.join(" / "), entry.row[0]]),
)
export const PRODUCT_TAXONOMY_VERSION = manifest.version
export const PRODUCT_TAXONOMY_COUNTS = {
  categories: categories.length,
  attributes: attributes.length,
  verticals: manifest.verticals,
}

export function findProductTaxonomyCategory(id: string) {
  const row = byId.get(id.replace(/^shopify:/, ""))
  if (!row) return undefined
  const path = pathFor(row)
  return {
    id: row[0],
    categoryKey: `shopify:${row[0]}`,
    name: row[1],
    path,
    label: path.join(" / "),
    version: PRODUCT_TAXONOMY_VERSION,
    attributes: row[3].flatMap((id) => {
      const value = attributesById.get(id)
      return value
        ? [
            {
              id: value[0],
              name: value[1],
              handle: value[2],
              description: value[3],
            },
          ]
        : []
    }),
  }
}
export function productTaxonomyCategoryForLabel(label: string) {
  const id = labels.get(label)
  return id ? findProductTaxonomyCategory(id) : undefined
}

/** Retrieval proposes categories, never specifications or merchant inventory. */
function rankProductTaxonomy(query: string) {
  const tokens = new Set(words(query))
  if (!tokens.size) return []
  const phrase = normalize(query)
  return indexed
    .flatMap(({ row, path, tokens: nameTokens }) => {
      const matched = nameTokens.filter((word) => tokens.has(word)).length
      if (!matched) return []
      const coverage = matched / nameTokens.length
      const exact = normalize(row[1]) === phrase
      const parentMatches = words(path.slice(0, -1).join(" ")).filter((word) =>
        tokens.has(word),
      ).length
      return [
        {
          id: row[0],
          score:
            (exact ? 20 : 0) +
            coverage * 8 +
            matched +
            Math.min(parentMatches, 3) * 0.2,
          coverage,
        },
      ]
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}
export function searchProductTaxonomy(query: string, limit = 8) {
  const scored = rankProductTaxonomy(query).slice(
    0,
    Math.min(Math.max(limit, 1), 12),
  )
  return scored.flatMap((match) => {
    const category = findProductTaxonomyCategory(match.id)
    return category
      ? [
          {
            ...category,
            attributes: category.attributes.slice(0, 12),
            score: match.score,
            completeNameMatch: match.coverage === 1,
          },
        ]
      : []
  })
}
export function suggestProductTaxonomy(query: string) {
  const candidates = rankProductTaxonomy(query)
  const [first, second] = candidates
  if (first?.coverage !== 1) return undefined
  const selected = findProductTaxonomyCategory(first.id)
  if (!selected) return undefined
  if (!second || first.score > second.score) return selected
  // Names such as "polo shirts" occur in adult, infant and sporting branches.
  // Suggest their shared category rather than guessing age, gender or use.
  const tied = candidates.filter((entry) => entry.score === first.score)
  const paths = tied.flatMap((entry) => {
    const row = byId.get(entry.id)
    return row ? [pathFor(row)] : []
  })
  const common = selected.path.filter((label, index) =>
    paths.every((path) => path[index] === label),
  )
  return common.length
    ? productTaxonomyCategoryForLabel(common.join(" / "))
    : undefined
}
