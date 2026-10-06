import { expect, test } from "bun:test"
import {
  type ReceiptCatalogItem,
  missingInventoryReceiptOptions,
} from "./inventory-receipt-options"
function eggs(): ReceiptCatalogItem {
  return {
    name: "Eggs",
    status: "active",
    product: {
      id: "eggs",
      currentUnitConfiguration: {
        units: [
          { id: "egg", name: "Egg", stockBehavior: "canonical_shared" },
          {
            id: "crate",
            name: "Crate",
            stockBehavior: "alternate_transaction",
          },
          { id: "pack", name: "Pack", stockBehavior: "packaged_stock" },
        ],
      },
    },
    variants: ["small", "big"].map((id) => ({
      id,
      name: id,
      status: "active",
      offerings: ["egg", "crate", "pack"].map((unit) => ({
        id: `${id}-${unit}`,
        status: "active",
        productUnit: { inventoryUnitId: unit },
        stores: [{ storeId: "south", isAvailable: true }],
      })),
    })),
  }
}
test("first receipt offers both sizes in actual balance units, without inventing a crate balance", () => {
  const options = missingInventoryReceiptOptions([eggs()], [], "south", "eggs")
  expect(options.map((x) => x.offeringId)).toEqual([
    "small-egg",
    "small-pack",
    "big-egg",
    "big-pack",
  ])
})
test("existing store pool suppresses only its own variant/unit, while staff custody does not suppress a store source", () => {
  const rows = [
    {
      productId: "eggs",
      variantId: "small",
      inventoryUnitId: "egg",
      custodyType: "STORE",
    },
    {
      productId: "eggs",
      variantId: "big",
      inventoryUnitId: "egg",
      custodyType: "STAFF",
    },
  ]
  expect(
    missingInventoryReceiptOptions([eggs()], rows, "south").map(
      (x) => x.offeringId,
    ),
  ).toEqual(["small-pack", "big-egg", "big-pack"])
})
test("product, inactive variant/offering and service scopes are respected", () => {
  const item = eggs()
  for (const variant of item.variants) {
    if (variant.id === "small") variant.status = "archived"
    else
      for (const offering of variant.offerings) {
        if (offering.id === "big-egg") offering.status = "archived"
      }
  }
  expect(
    missingInventoryReceiptOptions([item], [], "south").map(
      (x) => x.offeringId,
    ),
  ).toEqual(["big-pack"])
  expect(missingInventoryReceiptOptions([item], [], "other")).toMatchObject([
    { offeringId: "big-pack", needsAvailability: true },
  ])
  expect(missingInventoryReceiptOptions([item], [], "south", "other")).toEqual(
    [],
  )
  expect(
    missingInventoryReceiptOptions([{ ...item, product: null }], [], "south"),
  ).toEqual([])
})
