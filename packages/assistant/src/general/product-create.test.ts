import { expect, test } from "bun:test"
import { generalActionSchema, generalActionSummary } from "./contracts"
import {
  isSimpleProductCreate,
  productCreateDraft,
  productCreatePayload,
} from "./product-create"

// "Eggs: small 150, big 200 a piece, 30 make a crate, 20 big crates, 10 small."
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
      stockByUnit: [{ unitName: "Crate", quantity: "10" }],
    },
    {
      selections: [{ optionName: "Size", value: "Big" }],
      priceMinor: 20000,
      stockByUnit: [{ unitName: "Crate", quantity: "20" }],
    },
  ],
}

test("the first description drafts a full product: crate prices and stock in pieces", () => {
  const parsed = generalActionSchema.parse(eggs)
  if (parsed.action !== "product_create") throw Error("wrong action")
  const draft = productCreateDraft(parsed)
  expect(isSimpleProductCreate(draft)).toBe(false)
  expect(draft.variants).toEqual([
    {
      selections: [{ optionName: "Size", value: "Small" }],
      priceMinor: 15000,
      sellingUnitPrices: [{ unitName: "Crate", priceMinor: 450000 }],
      openingStock: expect.stringMatching(/^300(\.0+)?$/),
    },
    {
      selections: [{ optionName: "Size", value: "Big" }],
      priceMinor: 20000,
      sellingUnitPrices: [{ unitName: "Crate", priceMinor: 600000 }],
      openingStock: expect.stringMatching(/^600(\.0+)?$/),
    },
  ])
  expect(generalActionSchema.safeParse(draft).success).toBe(true)
  const lines = generalActionSummary(draft, "NGN").split("\n")
  expect(lines[0]).toBe("Eggs · counted in Piece · Crate = 30 Piece")
  expect(lines[1]).toContain("Small: ₦150.00 per Piece · ₦4,500.00 per Crate")
  expect(lines[2]).toContain("Big: ₦200.00 per Piece · ₦6,000.00 per Crate")
})

test("an owner's own pack price wins over size × unit price", () => {
  const parsed = generalActionSchema.parse({
    ...eggs,
    variants: [
      {
        ...eggs.variants[0],
        sellingUnitPrices: [{ unitName: "Crate", priceMinor: 400000 }],
      },
      eggs.variants[1],
    ],
  })
  if (parsed.action !== "product_create") throw Error("wrong action")
  expect(productCreateDraft(parsed).variants?.[0]?.sellingUnitPrices).toEqual([
    { unitName: "Crate", priceMinor: 400000 },
  ])
})

test("only a missing selling price blocks the card", () => {
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
