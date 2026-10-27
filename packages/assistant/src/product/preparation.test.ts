import { expect, test } from "bun:test"
import assert from "node:assert/strict"
import {
  productCreateAction,
  productCreateDraft,
  productCreateIssues,
} from "../general/product-create"
import { setupProductPayloadSchema } from "../setup/contracts"
import { setupProductVariants } from "../setup/variants"
import { productCategoryReference } from "./knowledge"
import { prepareProductPayload, productPreparationNotes } from "./preparation"

const eggs = () =>
  productCreateAction.parse({
    action: "product_create",
    name: "Eggs",
    canonicalUnitName: "Piece",
    sellingUnits: [
      { name: "Crate" },
      { name: "Carton", referenceUnitName: "Crate", referenceQuantity: "12" },
    ],
    options: [{ name: "Size", values: ["Big", "Small"] }],
    variants: [
      {
        selections: [{ optionName: "Size", value: "Big" }],
        priceMinor: 20000,
        sellingUnitPrices: [{ unitName: "Crate", priceMinor: 600000 }],
        stockByUnit: [
          { unitName: "Carton", quantity: "200" },
          { unitName: "Crate", quantity: "10" },
        ],
      },
      {
        selections: [{ optionName: "Size", value: "Small" }],
        priceMinor: 10000,
        sellingUnitPrices: [{ unitName: "Crate", priceMinor: 550000 }],
        stockByUnit: [
          { unitName: "Carton", quantity: "100" },
          { unitName: "Crate", quantity: "10" },
        ],
      },
    ],
  })

test("owner egg case: visible regional default, nested counts, independent prices and editable category", () => {
  const draft = productCreateDraft(eggs(), "NGN")
  expect(productCreateIssues(draft)).toEqual([])
  expect(draft.categoryKey).toBe("poultry:eggs")
  expect(draft.sellingUnits?.map((unit) => unit.containsQuantity)).toEqual([
    "30",
    "360",
  ])
  expect(draft.sellingUnits?.[0]?.quantityDefault).toBe("egg-crate-30")
  expect(draft.variants?.map((variant) => variant.openingStock)).toEqual([
    "72300",
    "36300",
  ])
  expect(
    draft.variants?.map((variant) =>
      variant.sellingUnitPrices?.map((price) => price.priceMinor),
    ),
  ).toEqual([
    [600000, 7200000],
    [550000, 6600000],
  ])
  expect(draft.variants?.[0]?.stockByUnit).toEqual(
    eggs().variants?.[0]?.stockByUnit,
  )
})

test("conversion and price correction recomputes dependent stock/suggestions without discarding raw counts", () => {
  const draft = productCreateDraft(eggs(), "NGN")
  assert(draft.sellingUnits?.[0])
  draft.sellingUnits[0].containsQuantity = "24"
  assert(draft.variants?.[0]?.sellingUnitPrices?.[0])
  draft.variants[0].sellingUnitPrices[0].priceMinor = 500000
  const corrected = productCreateDraft(draft, "NGN")
  expect(corrected.sellingUnits?.[0]?.quantityDefault).toBeUndefined()
  expect(corrected.sellingUnits?.[1]?.containsQuantity).toBe("288")
  expect(corrected.variants?.map((variant) => variant.openingStock)).toEqual([
    "57840",
    "29040",
  ])
  expect(corrected.variants?.[0]?.sellingUnitPrices?.[1]?.priceMinor).toBe(
    6000000,
  )
  expect(corrected.variants?.[1]?.sellingUnitPrices?.[0]?.priceMinor).toBe(
    550000,
  )
})

test("unknown, cyclic, zero and nonregional conversions remain unsaveable", () => {
  for (const currency of ["USD", ""])
    expect(
      productCreateIssues(productCreateDraft(eggs(), currency)).length,
    ).toBeGreaterThan(0)
  const input = eggs()
  assert(input.sellingUnits?.[0])
  input.sellingUnits[0].containsQuantity = "0"
  expect(
    productCreateIssues(productCreateDraft(input, "NGN")).length,
  ).toBeGreaterThan(0)
  input.sellingUnits[0] = {
    name: "Crate",
    containsQuantity: "30",
    referenceUnitName: "Carton",
    referenceQuantity: "2",
  }
  expect(
    productCreateIssues(productCreateDraft(input, "NGN")).length,
  ).toBeGreaterThan(0)
})

test("shirt preparation preserves colour stock without fabricating sizes, prices or gender", () => {
  const payload = prepareProductPayload(
    setupProductPayloadSchema.parse({
      kind: "product",
      name: "T-shirt",
      unitName: "Piece",
      options: [{ name: "Colour", values: ["Blue", "Red"] }],
      variants: [
        {
          selections: [{ optionName: "Colour", value: "Blue" }],
          openingStock: "30",
        },
        {
          selections: [{ optionName: "Colour", value: "Red" }],
          openingStock: "50",
        },
      ],
    }),
    "NGN",
  )
  expect(payload.categoryKey).toBe("clothing:t-shirts")
  expect(payload.options).toHaveLength(1)
  expect(payload.variants?.map((variant) => variant.openingStock)).toEqual([
    "30",
    "50",
  ])
  expect(
    payload.variants?.every((variant) => variant.priceMinor === undefined),
  ).toBe(true)
  expect(productPreparationNotes(payload).join(" ")).toContain(
    "Optional: add sizes",
  )
})

test("only supplied phone combinations are enabled; merchant classification wins", () => {
  const payload = prepareProductPayload(
    setupProductPayloadSchema.parse({
      kind: "product",
      name: "Samsung S24 Ultra",
      unitName: "Piece",
      categoryKey: "electronics",
      options: [
        { name: "Storage", values: ["256 GB", "512 GB"] },
        { name: "RAM", values: ["16 GB", "12 GB"] },
      ],
      variants: [
        {
          selections: [
            { optionName: "Storage", value: "256 GB" },
            { optionName: "RAM", value: "16 GB" },
          ],
          priceMinor: 1000000,
        },
      ],
    }),
    "NGN",
  )
  expect(payload.categoryKey).toBe("electronics")
  expect(setupProductVariants(payload)).toHaveLength(1)
  expect(payload.variants?.[0]?.openingStock).toBeUndefined()
  expect(productCategoryReference("Samsung S24 Ultra")?.taxonomyId).toBe(
    "el-4-8-5-2",
  )
  expect(productCategoryReference("Samsung S24 Ultra case")).toBeUndefined()
  expect(productCategoryReference("Egg tray packaging")).toBeUndefined()
})

test("invalid choice facts are retained for correction instead of silently discarded", () => {
  const input = eggs()
  assert(input.variants?.[0]?.selections[0])
  input.variants[0].selections[0].value = "Unknown"
  const draft = productCreateDraft(input, "NGN")
  expect(draft.variants?.[0]?.selections[0]?.value).toBe("Unknown")
  expect(productCreateIssues(draft).length).toBeGreaterThan(0)
})

test("revisions update inferred categories but preserve merchant overrides and nonstandard egg counts", () => {
  const suggested = productCreateDraft(eggs(), "NGN")
  const renamed = productCreateDraft({ ...suggested, name: "T-shirt" }, "NGN")
  expect(renamed.categoryKey).toBe("clothing:t-shirts")
  const manual = productCreateDraft(
    {
      ...suggested,
      name: "T-shirt",
      categoryKey: "poultry",
      categorySuggested: false,
    },
    "NGN",
  )
  expect(manual.categoryKey).toBe("poultry")
  const quail = productCreateDraft({ ...eggs(), name: "Quail eggs" }, "NGN")
  expect(quail.sellingUnits?.[0]?.containsQuantity).toBe("")
  expect(productCreateIssues(quail).length).toBeGreaterThan(0)
})

test("sealed packages preserve original counts and require their owning Catalog form", () => {
  const input = { ...eggs(), reviewRequirements: ["sealed_stock" as const] }
  const draft = productCreateDraft(input, "NGN")
  expect(draft.variants?.[0]?.stockByUnit).toEqual(
    input.variants?.[0]?.stockByUnit,
  )
  expect(draft.variants?.[0]?.openingStock).toBeUndefined()
  expect(
    productCreateDraft({ ...input, openingStock: "6000" }, "NGN").openingStock,
  ).toBeUndefined()
  expect(draft.sellingUnits?.[0]?.containsQuantity).toBe(
    input.sellingUnits?.[0]?.containsQuantity ?? "",
  )
  expect(
    productCreateIssues(draft).some((issue) => /sealed/i.test(issue)),
  ).toBe(true)
})

test("an explicitly listed canonical unit at factor one does not block the prepared Egg draft", () => {
  const input = eggs()
  input.sellingUnits?.unshift({ name: "Piece", containsQuantity: "1" })
  const draft = productCreateDraft(input, "NGN")
  expect(productCreateIssues(draft)).toEqual([])
  expect(draft.sellingUnits?.map((unit) => unit.name)).toEqual([
    "Crate",
    "Carton",
  ])
  expect(draft.variants?.map((row) => row.openingStock)).toEqual([
    "72300",
    "36300",
  ])
  const invalid = productCreateDraft(
    { ...input, sellingUnits: [{ name: "Piece", containsQuantity: "2" }] },
    "NGN",
  )
  expect(productCreateIssues(invalid)).toContain(
    "Give each selling unit a different name.",
  )
})

test("a redundant counting unit without a pack factor keeps the phone price blank", () => {
  const draft = productCreateDraft(
    {
      action: "product_create",
      name: "Samsung S24 Ultra",
      canonicalUnitName: "Piece",
      sellingUnits: [{ name: "Piece", containsQuantity: "" }],
      options: [
        { name: "Storage", values: ["256GB"] },
        { name: "RAM", values: ["16GB"] },
      ],
      variants: [
        {
          selections: [
            { optionName: "Storage", value: "256GB" },
            { optionName: "RAM", value: "16GB" },
          ],
        },
      ],
    },
    "NGN",
  )
  expect(draft.sellingUnits).toEqual([])
  expect(draft.variants).toHaveLength(1)
  expect(draft.variants?.[0]?.priceMinor).toBeUndefined()
  expect(productCreateIssues(draft)).toHaveLength(1)
  expect(productCreateIssues(draft)[0]).toContain("selling price")
})

test("a differently named one-to-one selling unit keeps its price and stock conversion", () => {
  const draft = productCreateDraft(
    {
      action: "product_create",
      name: "Oil",
      canonicalUnitName: "Litre",
      priceMinor: 100000,
      sellingUnits: [
        { name: "Bottle", containsQuantity: "1", priceMinor: 120000 },
      ],
      variants: [
        {
          selections: [],
          stockByUnit: [{ unitName: "Bottle", quantity: "5" }],
        },
      ],
    },
    "NGN",
  )
  expect(draft.sellingUnits).toHaveLength(1)
  expect(draft.variants?.[0]?.sellingUnitPrices?.[0]?.priceMinor).toBe(120000)
  expect(draft.variants?.[0]?.openingStock).toBe("5")
  expect(productCreateIssues(draft)).toEqual([])
})
test("a duplicate counting-unit price that conflicts with the base price is not discarded", () => {
  const draft = productCreateDraft(
    {
      action: "product_create",
      name: "Phone",
      canonicalUnitName: "Piece",
      priceMinor: 100000,
      sellingUnits: [
        { name: "Piece", containsQuantity: "1", priceMinor: 120000 },
      ],
    },
    "NGN",
  )
  expect(draft.sellingUnits?.[0]?.priceMinor).toBe(120000)
  expect(productCreateIssues(draft)).toContain(
    "Give each selling unit a different name.",
  )
})
