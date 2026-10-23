import { expect, test } from "bun:test"
import { generalActionSchema, generalActionSummary } from "./contracts"
import {
  isSimpleProductCreate,
  productCreateDraft,
  productCreatePayload,
} from "./product-create"

// Exact stated prices and conversions: Small150/Crate4000, Big200/Crate5500; Crate30.
const eggs = {
  action: "product_create",
  name: "Eggs",
  canonicalUnitName: "Piece",
  sellingUnits: [{ name: "Crate", containsQuantity: "30" }],
  options: [{ name: "Size", values: ["Small", "Big"] }],
  variants: [
    {
      selections: [{ optionName: "Size", value: "Small" }],
      priceMinor: 15000,
      sellingUnitPrices: [{ unitName: "Crate", priceMinor: 400000 }],
      stockByUnit: [{ unitName: "Crate", quantity: "25" }],
    },
    {
      selections: [{ optionName: "Size", value: "Big" }],
      priceMinor: 20000,
      sellingUnitPrices: [{ unitName: "Crate", priceMinor: 550000 }],
      stockByUnit: [{ unitName: "Crate", quantity: "500" }],
    },
  ],
}

test("complete facts draft exact stated crate prices and convert stock to pieces", () => {
  const parsed = generalActionSchema.parse(eggs)
  if (parsed.action !== "product_create") throw Error("wrong action")
  const draft = productCreateDraft(parsed)
  expect(isSimpleProductCreate(draft)).toBe(false)
  expect(draft.variants).toEqual([
    {
      selections: [{ optionName: "Size", value: "Small" }],
      priceMinor: 15000,
      sellingUnitPrices: [{ unitName: "Crate", priceMinor: 400000 }],
      openingStock: expect.stringMatching(/^750(\.0+)?$/),
    },
    {
      selections: [{ optionName: "Size", value: "Big" }],
      priceMinor: 20000,
      sellingUnitPrices: [{ unitName: "Crate", priceMinor: 550000 }],
      openingStock: expect.stringMatching(/^15000(\.0+)?$/),
    },
  ])
  expect(generalActionSchema.safeParse(draft).success).toBe(true)
  const lines = generalActionSummary(draft, "NGN").split("\n")
  expect(lines[0]).toBe("Eggs · counted in Piece · Crate = 30 Piece")
  expect(lines[1]).toContain("Small: ₦150.00 per Piece · ₦4,000.00 per Crate")
  expect(lines[2]).toContain("Big: ₦200.00 per Piece · ₦5,500.00 per Crate")
})

test("a stated pack price remains independent of the individual price", () => {
  const parsed = generalActionSchema.parse({
    ...eggs,
    variants: [
      {
        ...eggs.variants[0],
        sellingUnitPrices: [{ unitName: "Crate", priceMinor: 420000 }],
      },
      eggs.variants[1],
    ],
  })
  if (parsed.action !== "product_create") throw Error("wrong action")
  expect(productCreateDraft(parsed).variants?.[0]?.sellingUnitPrices).toEqual([
    { unitName: "Crate", priceMinor: 420000 },
  ])
})

test("missing selling prices and ambiguous total stock block the card", () => {
  const noPrice = generalActionSchema.safeParse({
    ...eggs,
    variants: [
      { ...eggs.variants[0], priceMinor: undefined },
      eggs.variants[1],
    ],
  })
  expect(noPrice.success).toBe(false)
  expect(noPrice.error?.issues[0]?.message).toContain("selling price for Small")
  const sharedStock = generalActionSchema.safeParse({
    ...eggs,
    openingStock: "900",
  })
  expect(sharedStock.success).toBe(false)
})

test("a simple product keeps its single-price draft", () => {
  const parsed = generalActionSchema.parse({
    action: "product_create",
    name: "Indomie",
    canonicalUnitName: "Pack",
    priceMinor: 25000,
    openingStock: "40",
  })
  if (parsed.action !== "product_create") throw Error("wrong action")
  expect(isSimpleProductCreate(parsed)).toBe(true)
  expect(productCreateDraft(parsed)).toEqual(parsed)
  expect(generalActionSummary(parsed, "NGN")).toBe(
    "Indomie · ₦250.00 per Pack\nstock 40 Pack",
  )
})

test("a draft gets a matching library picture; a photo replaces it", () => {
  const parsed = generalActionSchema.parse(eggs)
  if (parsed.action !== "product_create") throw Error("wrong action")
  const draft = productCreateDraft(parsed)
  expect(draft.illustrationId).toBe("ill-egg")
  expect(generalActionSummary(draft, "NGN").split("\n").at(-1)).toBe(
    "Picture: Egg",
  )
  const photo = productCreateDraft({ ...draft, photoAssetId: "asset_1" })
  expect(photo.illustrationId).toBeUndefined()
  expect(productCreatePayload(photo).illustrationId).toBeUndefined()
  expect(generalActionSummary(photo, "NGN").split("\n").at(-1)).toBe(
    "Photo added",
  )
  // Removing the picture is kept; it is not picked again.
  expect(
    productCreateDraft({ ...draft, illustrationId: null }).illustrationId,
  ).toBeNull()
  expect(
    generalActionSchema.safeParse({ ...eggs, illustrationId: "ill-unknown" })
      .success,
  ).toBe(false)
})

test("missing or invalid crate conversions cannot become a product proposal", () => {
  for (const sellingUnits of [
    undefined,
    [{ name: "Crate", containsQuantity: "" }],
    [{ name: "Crate", containsQuantity: "0" }],
  ]) {
    const result = generalActionSchema.safeParse({ ...eggs, sellingUnits })
    expect(result.success).toBe(false)
    expect(
      result.error?.issues.some((issue) =>
        /crate|pack sizes/i.test(issue.message),
      ),
    ).toBe(true)
  }
})

test("General never supplies an unstated pack price during validation, normalization or review", () => {
  const input = {
    ...eggs,
    variants: eggs.variants.map((variant) => ({
      ...variant,
      sellingUnitPrices: undefined,
    })),
  }
  const result = generalActionSchema.safeParse(input)
  expect(result.success).toBe(false)
  expect(
    result.error?.issues.some((issue) => issue.message.includes("per crate")),
  ).toBe(true)
  const direct = productCreateDraft(input)
  expect(direct.variants?.map((variant) => variant.sellingUnitPrices)).toEqual([
    [],
    [],
  ])
  expect(generalActionSummary(direct, "NGN")).toContain("Crate price needed")
  expect(generalActionSummary(direct, "NGN")).not.toContain("₦4,500.00")
})

test("Carton packaging stays descriptive and an unpriced carton cannot be enrolled for sale", () => {
  const input = {
    ...eggs,
    description: "Carton packaging: 12 crates; not sold",
  }
  const parsed = generalActionSchema.parse(input)
  if (parsed.action !== "product_create") throw Error("wrong action")
  const draft = productCreateDraft(parsed)
  expect(draft.description).toBe(input.description)
  expect(draft.sellingUnits?.map((unit) => unit.name)).toEqual(["Crate"])
  expect(
    draft.variants
      ?.flatMap((variant) => variant.sellingUnitPrices ?? [])
      .some((price) => price.unitName === "Carton"),
  ).toBe(false)
  const unpriced = generalActionSchema.safeParse({
    ...input,
    sellingUnits: [
      ...eggs.sellingUnits,
      { name: "Carton", containsQuantity: "360" },
    ],
  })
  expect(unpriced.success).toBe(false)
  expect(
    unpriced.error?.issues.some((issue) =>
      issue.message.includes("per carton"),
    ),
  ).toBe(true)
})

test("explicit shared and zero pack prices are preserved without deriving a replacement", () => {
  const input = {
    action: "product_create",
    name: "Sample",
    canonicalUnitName: "Piece",
    priceMinor: 15000,
    sellingUnits: [{ name: "Crate", containsQuantity: "30", priceMinor: 0 }],
  }
  const parsed = generalActionSchema.parse(input)
  if (parsed.action !== "product_create") throw Error("wrong action")
  expect(productCreateDraft(parsed).variants?.[0]?.sellingUnitPrices).toEqual([
    { unitName: "Crate", priceMinor: 0 },
  ])
})

test("a stated stock correction converts Small crates without changing Big or either price", () => {
  const parsed = generalActionSchema.parse({
    ...eggs,
    variants: [
      {
        ...eggs.variants[0],
        stockByUnit: [{ unitName: "Crate", quantity: "30" }],
      },
      eggs.variants[1],
    ],
  })
  if (parsed.action !== "product_create") throw Error("wrong action")
  const draft = productCreateDraft(parsed)
  expect(draft.variants?.map((variant) => variant.openingStock)).toEqual([
    "900",
    "15000",
  ])
  expect(
    draft.variants?.map((variant) => ({
      unit: variant.priceMinor,
      crate: variant.sellingUnitPrices?.[0]?.priceMinor,
    })),
  ).toEqual([
    { unit: 15000, crate: 400000 },
    { unit: 20000, crate: 550000 },
  ])
})
