import { expect, test } from "bun:test"
import {
  type GeneralReviewPresentation,
  generalReviewPresentationSchema,
} from "@ewatrade/assistant/general/contracts"
import type { ProductCreateAction } from "@ewatrade/assistant/general/product-create"
import {
  customerCreatePresentation,
  customerUpdatePresentation,
  productAvailabilityPresentation,
  productCreatePresentation,
  productDetailsPresentation,
  productIdentifiersPresentation,
  productPricePresentation,
  unitConfigurationPresentation,
} from "./catalog-review-presentations"

const valid = (p: GeneralReviewPresentation) => {
  const parsed = generalReviewPresentationSchema.safeParse(p)
  if (!parsed.success) throw Error(JSON.stringify(parsed.error.issues))
  return p
}
const offering = {
  itemName: "Quail Eggs",
  variantName: "Default",
  name: "Tray",
}

test("a new customer reads name and contact", () => {
  expect(
    valid(
      customerCreatePresentation({
        name: "Amina Bello",
        phone: "0803 000 0000",
      }),
    ),
  ).toEqual({
    summary: { party: "Amina Bello", amountLabel: "new customer" },
    facts: [{ label: "Phone", value: "0803 000 0000" }],
  })
  expect(customerCreatePresentation({ name: "Walk-in Ada" }).facts).toEqual([
    { value: "No phone or email" },
  ])
})

test("updates read as a Was / Now table", () => {
  const p = valid(
    customerUpdatePresentation("Bola Okafor", [
      { label: "Email", before: null, after: "bola@example.com" },
      { label: "Phone", before: "0803", after: null },
    ]),
  )
  expect(p.table?.columns.map((c) => c.label)).toEqual(["Field", "Was", "Now"])
  expect(p.table?.rows).toEqual([
    { cells: ["Email", "Not set", "bola@example.com"] },
    { cells: ["Phone", "0803", "Removed"] },
  ])
  expect(p.facts).toEqual([{ value: "2 changes" }])
  expect(
    valid(
      productDetailsPresentation("Quail Eggs", [
        { label: "Name", before: "Eggs", after: "Quail Eggs" },
      ]),
    ).summary.party,
  ).toBe("Quail Eggs")
  expect(
    valid(
      productIdentifiersPresentation(offering, [
        { label: "SKU", before: null, after: "QE-30" },
      ]),
    ).summary.party,
  ).toBe("Quail Eggs · Default · Tray")
})

test("a simple product reads price per unit and opening stock", () => {
  const p = valid(
    productCreatePresentation(
      {
        action: "product_create",
        name: "Family bread",
        canonicalUnitName: "Loaf",
        priceMinor: 180000,
        openingStock: "20",
      } as ProductCreateAction,
      "NGN",
    ),
  )
  expect(p.summary).toEqual({
    party: "Family bread",
    amount: "₦1,800.00",
    amountLabel: "per Loaf",
  })
  expect(p.facts).toEqual([{ label: "Opening stock", value: "20 Loaf" }])
  expect(p.table).toBeUndefined()
})

test("a product with options and packs reads as an options table", () => {
  const p = valid(
    productCreatePresentation(
      {
        action: "product_create",
        name: "Eggs",
        canonicalUnitName: "Piece",
        priceMinor: 8000,
        sellingUnits: [
          { name: "Tray", containsQuantity: "30", priceMinor: 240000 },
        ],
        options: [{ name: "Size", values: ["Small", "Large"] }],
      } as ProductCreateAction,
      "NGN",
    ),
  )
  expect(p.summary.context).toBe("Counted in Piece · Tray = 30 Piece")
  expect(p.facts).toEqual([{ value: "2 options" }, { value: "1 pack size" }])
  expect(p.table?.rows[0]?.cells).toEqual(["Small", "₦80.00 / Piece", "None"])
  expect(p.table?.rows[0]?.detail).toBe("₦2,400.00 / Tray")
})

test("price and availability changes lead with the new state", () => {
  const price = valid(
    productPricePresentation({
      offering,
      currencyCode: "NGN",
      beforeMinor: 240000,
      afterMinor: 250000,
      reason: "Supplier price rise",
    }),
  )
  expect(price.summary.amount).toBe("₦2,500.00")
  expect(price.facts).toEqual([{ label: "Was", value: "₦2,400.00" }])
  const availability = valid(
    productAvailabilityPresentation({
      offering,
      before: true,
      after: false,
      storeName: "Main store",
    }),
  )
  expect(availability.summary).toMatchObject({
    amount: "Unavailable",
    amountLabel: "in Main store",
  })
  expect(availability.facts).toEqual([{ label: "Was", value: "Available" }])
})

test("a unit configuration lists proposed units and folds the rest", () => {
  const unit = (name: string, factor: string, stockBehavior: string) => ({
    name,
    factor,
    stockBehavior,
    transactionScale: 0,
  })
  const p = valid(
    unitConfigurationPresentation({
      productName: "Quail Eggs",
      publish: false,
      currentVersion: 1,
      currentScale: 0,
      proposedScale: 0,
      current: [unit("Piece", "1", "CANONICAL_SHARED")],
      proposed: [
        unit("Piece", "1", "CANONICAL_SHARED"),
        unit("Tray", "30", "ALTERNATE_TRANSACTION"),
      ],
      replaces: { version: 2, units: [unit("Piece", "1", "CANONICAL_SHARED")] },
      offerings: [
        {
          variantName: "Default",
          name: "Piece",
          price: "₦80.00",
          unitKey: "piece",
        },
      ],
      balances: [
        {
          storeName: "Main store",
          variantName: "Default",
          unitName: "Piece",
          onHand: "149",
          reserved: "1",
          custodyType: "STORE",
        },
      ],
    }),
  )
  expect(p.summary.context).toContain("Save a draft only")
  expect(p.facts).toContainEqual({ label: "Replaces draft", value: "v2" })
  expect(p.table?.rows[1]?.cells).toEqual([
    "Tray",
    "× 30",
    "Shared selling unit",
  ])
  expect(p.sections?.map((s) => s.title)).toEqual([
    "Current units",
    "Draft being replaced",
    "Affected selling offerings",
    "Stock sources",
  ])
})
