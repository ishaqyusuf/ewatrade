/** Reproducible offline import: bun scripts/import-product-taxonomy.ts /path/categories.json
 * Download the pinned Shopify release asset separately; never refresh on startup.
 */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
const input = process.argv[2]
if (!input) throw Error("Supply the downloaded categories JSON")
const bytes = readFileSync(input)
const source = JSON.parse(bytes.toString())
if (source.version !== "2026-08" || !Array.isArray(source.verticals))
  throw Error("Expected pinned 2026-08 categories")
const shortId = (id: string) => id.slice(id.lastIndexOf("/") + 1)
const attributes = new Map<string, [string, string, string, string]>()
const categories: [string, string, string | null, string[]][] = []
for (const vertical of source.verticals)
  for (const category of vertical.categories) {
    categories.push([
      shortId(category.id),
      category.name,
      category.parent_id ? shortId(category.parent_id) : null,
      category.attributes.map((attribute: { id: string }) =>
        shortId(attribute.id),
      ),
    ])
    for (const attribute of category.attributes)
      attributes.set(shortId(attribute.id), [
        shortId(attribute.id),
        attribute.name,
        attribute.handle,
        attribute.description,
      ])
  }
const ids = new Set(categories.map(([id]) => id))
if (
  ids.size !== categories.length ||
  categories.some(([, name, parent]) => !name || (parent && !ids.has(parent)))
)
  throw Error("Invalid hierarchy")
const root = new URL("../packages/utils/src/product-taxonomy/", import.meta.url)
writeFileSync(
  new URL("categories.json", root),
  `${JSON.stringify(categories)}\n`,
)
writeFileSync(
  new URL("attributes.json", root),
  `${JSON.stringify([...attributes.values()])}\n`,
)
writeFileSync(
  new URL("manifest.json", root),
  `${JSON.stringify(
    {
      version: source.version,
      source:
        "https://github.com/Shopify/product-taxonomy/releases/tag/v2026-08",
      sourceSha256: createHash("sha256").update(bytes).digest("hex"),
      categories: categories.length,
      attributes: attributes.size,
      verticals: source.verticals.length,
    },
    null,
    2,
  )}\n`,
)
console.log(
  `Imported ${categories.length} categories and ${attributes.size} attributes across ${source.verticals.length} verticals`,
)
