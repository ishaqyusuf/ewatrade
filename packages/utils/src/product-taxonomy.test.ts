import { expect, test } from "bun:test"
import {
  PRODUCT_TAXONOMY_COUNTS,
  findProductTaxonomyCategory,
  productTaxonomyCategoryForLabel,
  searchProductTaxonomy,
  suggestProductTaxonomy,
} from "./product-taxonomy"

test("pinned taxonomy includes the complete category release and usable category attributes", () => {
  expect(PRODUCT_TAXONOMY_COUNTS).toEqual({
    categories: 14606,
    attributes: 8195,
    verticals: 26,
  })
  const phone = findProductTaxonomyCategory("el-4-8-5-2")
  expect(phone?.name).toBe("Smart Phones")
  expect(phone?.attributes.length).toBeGreaterThan(0)
  expect(phone && productTaxonomyCategoryForLabel(phone.label)?.id).toBe(
    phone?.id,
  )
  expect(findProductTaxonomyCategory("shopify:made-up-id")).toBeUndefined()
})

test("retrieval reaches categories outside the three original examples and stays bounded", () => {
  for (const query of [
    "Rice",
    "Refrigerators",
    "Lipstick",
    "Bicycles",
    "Dog Food",
    "Curtains",
  ]) {
    const matches = searchProductTaxonomy(query)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.length).toBeLessThanOrEqual(8)
    expect(matches[0]?.completeNameMatch).toBe(true)
    expect(matches.every((category) => category.attributes.length <= 12)).toBe(
      true,
    )
  }
  expect(suggestProductTaxonomy("UnrecognizableAcmeWidget")).toBeUndefined()
  expect(searchProductTaxonomy("")).toEqual([])
})

test("ambiguous names use a shared ancestor across the whole index rather than only the bounded result page", () => {
  expect(suggestProductTaxonomy("Polo Shirts")?.label).toContain("Clothing")
  const partial = searchProductTaxonomy("Accessories")
  expect(partial.length).toBeLessThanOrEqual(8)
  expect(suggestProductTaxonomy("Accessories")).toBeUndefined()
})

test("tree browsing retains arbitrary ancestry, bounded pages and sibling-bound cursors", async () => {
  const { browseProductTaxonomy } = await import("./product-taxonomy")
  const roots = browseProductTaxonomy({ limit: 2 })
  expect(roots.categories).toHaveLength(2)
  expect(roots.nextCursor).not.toBeNull()
  const next = browseProductTaxonomy({
    limit: 2,
    after: roots.nextCursor ?? undefined,
  })
  expect(next.categories.map((entry) => entry.id)).not.toContain(
    roots.categories[0]?.id,
  )
  const branch = browseProductTaxonomy({ parentId: "shopify:fb-2-12-1" })
  expect(branch.breadcrumbs.map((entry) => entry.categoryKey)).toEqual([
    "shopify:fb",
    "shopify:fb-2",
    "shopify:fb-2-12",
    "shopify:fb-2-12-1",
  ])
  expect(
    branch.categories.some(
      (entry) => entry.categoryKey === "shopify:fb-2-12-1-4",
    ),
  ).toBe(true)
  expect(() =>
    browseProductTaxonomy({
      parentId: "shopify:fb",
      after: roots.categories[0]?.id,
    }),
  ).toThrow("cursor")
  expect(() => browseProductTaxonomy({ parentId: "shopify:invented" })).toThrow(
    "category",
  )
  expect(
    browseProductTaxonomy().categories.some(
      (entry) => entry.name === "Services",
    ),
  ).toBe(true)
})

test("default category results omit attributes and selected-identity attribute reads stay bounded", async () => {
  const { searchProductTaxonomyCategories, readProductTaxonomyAttributes } =
    await import("./product-taxonomy")
  const results = searchProductTaxonomyCategories("Smart Phones")
  expect(results.length).toBeGreaterThan(0)
  expect(results.length).toBeLessThanOrEqual(8)
  expect(results.every((entry) => !("attributes" in entry))).toBe(true)
  const attributes = readProductTaxonomyAttributes("shopify:el-4-8-5-2")
  expect(attributes?.attributes.length).toBeGreaterThan(0)
  expect(attributes?.attributes.length).toBeLessThanOrEqual(12)
  expect(
    attributes?.attributes.every((entry) => !("description" in entry)),
  ).toBe(true)
  expect(readProductTaxonomyAttributes("shopify:invented")).toBeNull()
})
