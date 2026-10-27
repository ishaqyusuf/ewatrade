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
