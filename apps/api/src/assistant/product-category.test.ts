import { expect, test } from "bun:test"
import {
  productCreateDraft,
  productCreatePayload,
} from "@ewatrade/assistant/general/product-create"
import { catalogCategoryIdentity } from "../../../../packages/db/src/queries/catalog-category-identity"
import {
  prepareProductCategory,
  searchProductCategories,
  trustedProductCategoryLabel,
} from "./product-category"

test("general product categories resolve beyond the original samples and trusted labels override input", () => {
  const original = productCreatePayload(
    productCreateDraft(
      {
        action: "product_create",
        name: "Refrigerators",
        canonicalUnitName: "Piece",
      },
      "NGN",
    ),
  )
  const prepared = prepareProductCategory(original)
  expect(prepared.categoryKey).toMatch(/^shopify:/)
  expect(prepared.categoryLabel).toContain("Refrigerators")
  const selected = prepareProductCategory({
    ...prepared,
    categorySuggested: false,
    categoryLabel: "Fake label",
  })
  expect(selected.categoryLabel).toBe(prepared.categoryLabel ?? "")
  expect(trustedProductCategoryLabel(selected.categoryKey)).toBe(
    prepared.categoryLabel ?? "",
  )
  const identity = catalogCategoryIdentity(prepared.categoryLabel ?? "")
  expect(identity.rootLabel).not.toBe(prepared.categoryLabel ?? "")
  expect(identity.childLabel).toContain("Refrigerators")
  expect(
    prepareProductCategory({
      ...original,
      categoryKey: "electronics",
      categorySuggested: false,
    }).categoryKey,
  ).toBe("electronics")
  expect(trustedProductCategoryLabel("shopify:made-up-id")).toBeUndefined()
})

test("a retrieved valid suggestion survives normalization even when the name has no unique automatic match", () => {
  const category = searchProductCategories("shirts")[0]
  if (!category) throw Error("Pinned shirt category missing")
  const prepared = prepareProductCategory({
    kind: "product",
    name: "Polo Shirts",
    unitName: "Piece",
    categoryKey: category.categoryKey,
    categorySuggested: true,
    categoryLabel: "Untrusted label",
  })
  expect(prepared.categoryKey).toBe(category.categoryKey)
  expect(prepared.categoryLabel).toBe(category.label)
})
