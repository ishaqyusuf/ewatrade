import { expect, test } from "bun:test"
import {
  generalActionSchema,
  generalActionSummary,
} from "@ewatrade/assistant/general/contracts"
import {
  productCreateDraft,
  productCreateIssues,
} from "@ewatrade/assistant/general/product-create"
import {
  type ProductDraft,
  addGroup,
  addValue,
  addVariant,
  missingVariants,
  optionValueIssue,
  removeGroup,
  removeValue,
  removeVariant,
  renameGroup,
  updateVariant,
  variantsFromDraft,
  variantsIssue,
  variantsPayload,
} from "./general-product-variants-model"

const eggs: ProductDraft = productCreateDraft(
  {
    action: "product_create",
    name: "Eggs",
    canonicalUnitName: "Piece",
    sellingUnits: [{ name: "Crate", containsQuantity: "30" }],
    options: [{ name: "Size", values: ["Big", "Small"] }],
    variants: [
      {
        selections: [{ optionName: "Size", value: "Big" }],
        priceMinor: 25000,
        sellingUnitPrices: [{ unitName: "crate", priceMinor: 700000 }],
        stockByUnit: [{ unitName: "crate", quantity: "2" }],
      },
      {
        selections: [{ optionName: "Size", value: "Small" }],
        priceMinor: 20000,
      },
    ],
  },
  "NGN",
)
const save = (state: ReturnType<typeof variantsFromDraft>) =>
  generalActionSchema.parse({ ...eggs, ...variantsPayload(state, eggs) })

test("a draft opens as one editable row per variant, keyed by its own unit names", () => {
  const state = variantsFromDraft(eggs)
  expect(state.groups.map((group) => [group.name, group.values])).toEqual([
    ["Size", ["Big", "Small"]],
  ])
  const [big, small] = state.rows
  expect(big?.price).toBe("250")
  expect(big?.packPrices).toEqual({ Crate: "7000" })
  expect(big?.stock).toEqual({ Crate: "2" })
  // Small's crate price is the server's disclosed suggestion.
  expect(small?.derived).toEqual({ Crate: "Piece" })
})

test("edits save prices, per-unit stock and codes the server can apply", () => {
  let state = variantsFromDraft(eggs)
  const [big, small] = state.rows
  if (!big || !small) throw Error("rows")
  state = updateVariant(state, big.id, {
    stock: { Crate: "2", Piece: "10" },
    sku: " EGG-BIG ",
    barcode: "6150000000011",
  })
  state = updateVariant(state, small.id, { stock: { Piece: "40" } })
  const saved = save(state)
  if (saved.action !== "product_create") throw Error("action")
  expect(saved.variantMode).toBe("explicit")
  expect(saved.variants?.[0]).toMatchObject({
    priceMinor: 25000,
    sellingUnitPrices: [{ unitName: "Crate", priceMinor: 700000 }],
    stockByUnit: [
      { unitName: "Piece", quantity: "10" },
      { unitName: "Crate", quantity: "2" },
    ],
    sku: "EGG-BIG",
    barcode: "6150000000011",
  })
  expect(saved.variants?.[1]).toMatchObject({ openingStock: "40" })
  expect(saved.variants?.[1]).not.toHaveProperty("stockByUnit")
  // Untouched suggestions stay marked; a typed price clears the mark.
  expect(saved.variants?.[1]?.sellingUnitPrices?.[0]?.derivedFromUnit).toBe(
    "Piece",
  )
  const prepared = productCreateDraft(saved, "NGN")
  expect(prepared.variants?.[0]?.openingStock).toBe("70")
  expect(productCreateIssues(prepared)).toEqual([])
  expect(generalActionSummary(prepared, "NGN")).toContain("SKU EGG-BIG")
})

test("option values add and remove their variants; removed ones can be added back", () => {
  let state = variantsFromDraft(eggs)
  const size = state.groups[0]
  if (!size) throw Error("group")
  expect(optionValueIssue(state, size.id, "big")).toBe("Size already has big.")
  state = addValue(state, size.id, "Jumbo")
  expect(state.rows.map((row) => row.selections[0]?.value)).toEqual([
    "Big",
    "Small",
    "Jumbo",
  ])
  const small = state.rows[1]
  if (!small) throw Error("small")
  state = removeVariant(state, small.id)
  expect(missingVariants(state)).toEqual([
    [{ optionName: "Size", value: "Small" }],
  ])
  const saved = save(state)
  if (saved.action !== "product_create") throw Error("action")
  // Explicit mode creates only the listed variants, so Small stays removed.
  expect(
    productCreateDraft(saved, "NGN").variants?.map(
      (variant) => variant.selections[0]?.value,
    ),
  ).toEqual(["Big", "Jumbo"])
  state = addVariant(state, [{ optionName: "Size", value: "Small" }])
  expect(missingVariants(state)).toEqual([])
  state = removeValue(state, size.id, "Jumbo")
  expect(state.groups[0]?.values).toEqual(["Big", "Small"])
  expect(state.rows).toHaveLength(2)
})

test("renaming, adding and removing options keeps typed variant details", () => {
  let state = variantsFromDraft(eggs)
  const size = state.groups[0]
  if (!size) throw Error("group")
  state = renameGroup(state, size.id, "Grade")
  state = addGroup(state, "Shell", "Brown", { price: "", unitName: "Piece" })
  expect(state.rows[0]?.selections).toEqual([
    { optionName: "Grade", value: "Big" },
    { optionName: "Shell", value: "Brown" },
  ])
  expect(state.rows[0]?.price).toBe("250")
  state = removeGroup(state, state.groups[0]?.id ?? "")
  // Big and Small differed only by Grade, so the first one is kept.
  expect(state.rows).toHaveLength(1)
  expect(state.rows[0]?.price).toBe("250")
  expect(save(state).action).toBe("product_create")
})

test("a single-price draft becomes its first variant with its price and stock", () => {
  const simple = productCreateDraft(
    {
      action: "product_create",
      name: "Shirt",
      canonicalUnitName: "Piece",
      priceMinor: 500000,
    },
    "NGN",
  )
  const state = variantsFromDraft(simple)
  expect(state.rows).toEqual([])
  const next = addGroup(state, "Colour", "Red", {
    price: "5000",
    stock: "12",
    unitName: "Piece",
  })
  expect(next.rows[0]).toMatchObject({
    price: "5000",
    stock: { Piece: "12" },
  })
})

test("invalid prices, quantities and shared codes point at their variant", () => {
  let state = variantsFromDraft(eggs)
  const [big, small] = state.rows
  if (!big || !small) throw Error("rows")
  expect(
    variantsIssue(updateVariant(state, big.id, { price: "25O" }), eggs, "NGN"),
  ).toEqual({
    message: "Big: Enter a valid price with up to two decimal places.",
    rowId: big.id,
  })
  expect(
    variantsIssue(
      updateVariant(state, small.id, { stock: { Crate: "1.234" } }),
      eggs,
      "NGN",
    )?.message,
  ).toBe("Small: Enter a valid opening quantity for Crate.")
  state = updateVariant(state, big.id, { sku: "EGG" })
  state = updateVariant(state, small.id, { sku: "EGG" })
  expect(variantsIssue(state, eggs, "NGN")).toEqual({
    message: "Small: give each variant a different SKU.",
    rowId: small.id,
  })
  expect(
    variantsIssue(
      updateVariant(state, small.id, { sku: "x".repeat(121) }),
      eggs,
      "NGN",
    )?.message,
  ).toBe("Small: Keep inventory codes within 120 characters.")
})
