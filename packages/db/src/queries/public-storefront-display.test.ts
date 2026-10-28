import { expect, test } from "bun:test"
import {
  publicItemAvailability,
  publicLowStockQuantity,
  publicOptionPrice,
  publicStockAvailability,
  publicStorefrontOptionName,
  publicStorefrontWhatsAppPhone,
} from "./public-storefront-display"

const balance = (unit: string, onHand: string, reserved = "0") => ({
  inventoryUnitId: unit,
  onHandQuantity: onHand,
  reservedQuantity: reserved,
})

test("untracked stock is unknown; reserved tracked stock is out of stock", () => {
  expect(publicStockAvailability([])).toBeNull()
  expect(publicStockAvailability([balance("pair", "3", "3")])).toBe(
    "OUT_OF_STOCK",
  )
  expect(publicStockAvailability([balance("pair", "0")])).toBe("OUT_OF_STOCK")
})
test("stock uses exact decimals and never offsets unlike inventory units", () => {
  expect(
    publicStockAvailability([balance("pair", "1.000000000000000001", "1")]),
  ).toBeNull()
  expect(
    publicStockAvailability([balance("pair", "1"), balance("box", "0", "3")]),
  ).toBeNull()
  expect(
    publicStockAvailability([balance("pair", "1"), balance("pair", "0", "1")]),
  ).toBe("OUT_OF_STOCK")
})
test("a product is sold out only when all its public options are sold out", () => {
  expect(
    publicItemAvailability([
      { availability: "OUT_OF_STOCK" },
      { availability: null },
    ]),
  ).toBeNull()
  expect(
    publicItemAvailability([
      { availability: "OUT_OF_STOCK" },
      { availability: "MADE_TO_ORDER" },
    ]),
  ).toBe("MADE_TO_ORDER")
  expect(publicItemAvailability([{ availability: "OUT_OF_STOCK" }])).toBe(
    "OUT_OF_STOCK",
  )
})
test("minimum prices require comparable fixed prices; quotes are never zero", () => {
  expect(
    publicOptionPrice(
      [
        { priceMinor: 950000, currencyCode: "NGN" },
        { priceMinor: 1200000, currencyCode: "NGN" },
      ],
      "NGN",
    ),
  ).toMatchObject({ priceMinor: 950000, isFromPrice: true })
  expect(
    publicOptionPrice(
      [
        { priceMinor: 950000, currencyCode: "NGN" },
        { priceMinor: null, currencyCode: "NGN" },
      ],
      "NGN",
    ).priceMinor,
  ).toBeNull()
  expect(
    publicOptionPrice(
      [
        { priceMinor: 100, currencyCode: "USD" },
        { priceMinor: 200, currencyCode: "NGN" },
      ],
      "NGN",
    ).priceMinor,
  ).toBeNull()
})

test("public WhatsApp uses valid Store support contact only and fails closed for QA/plan/missing country", () => {
  const contact = {
    supportPhone: "08031234567",
    countryCode: "NG",
    messagesEnabled: true,
    isQaPreview: false,
  }
  expect(publicStorefrontWhatsAppPhone(contact)).toBe("+2348031234567")
  expect(
    publicStorefrontWhatsAppPhone({ ...contact, isQaPreview: true }),
  ).toBeNull()
  expect(
    publicStorefrontWhatsAppPhone({ ...contact, messagesEnabled: false }),
  ).toBeNull()
  expect(
    publicStorefrontWhatsAppPhone({ ...contact, countryCode: null }),
  ).toBeNull()
  expect(
    publicStorefrontWhatsAppPhone({ ...contact, supportPhone: "bad" }),
  ).toBeNull()
})

test("matching service variant and offering labels do not repeat", () => {
  expect(publicStorefrontOptionName("Trousers", "Trousers", false)).toBe(
    "Trousers",
  )
  expect(publicStorefrontOptionName("Rug LG", "rug  lg", false)).toBe("rug  lg")
  expect(publicStorefrontOptionName("Red", "Box of six", false)).toBe(
    "Red · Box of six",
  )
  expect(publicStorefrontOptionName("Standard", "Pair", true)).toBe("Pair")
})

test("low-stock counts: exact free units, only low stock in the option's own unit", () => {
  const pair = { inventoryUnitId: "pair", transactionScale: 0 }
  // On hand minus reserved, summed across this Store's balances of the same unit.
  expect(
    publicLowStockQuantity(
      [balance("pair", "4", "1"), balance("pair", "1")],
      "5",
      pair,
    ),
  ).toBe("4")
  expect(
    publicLowStockQuantity(
      [balance("pair", "3.000000000000000000", "1")],
      "5",
      pair,
    ),
  ).toBe("2")
  // Ordinary (in) stock, no level, unknown or sold out: no count.
  expect(publicLowStockQuantity([balance("pair", "9")], "5", pair)).toBe(
    undefined,
  )
  expect(publicLowStockQuantity([balance("pair", "2")], null, pair)).toBe(
    undefined,
  )
  expect(publicLowStockQuantity([balance("pair", "2")], "0", pair)).toBe(
    undefined,
  )
  expect(publicLowStockQuantity([], "5", pair)).toBe(undefined)
  expect(publicLowStockQuantity([balance("pair", "2", "2")], "5", pair)).toBe(
    undefined,
  )
  // Ambiguous units: another unit's balance, or no selling unit, never sums.
  expect(
    publicLowStockQuantity(
      [balance("pair", "2"), balance("box", "1")],
      "5",
      pair,
    ),
  ).toBe(undefined)
  expect(publicLowStockQuantity([balance("box", "2")], "5", pair)).toBe(
    undefined,
  )
  expect(publicLowStockQuantity([balance("pair", "2")], "5", null)).toBe(
    undefined,
  )
})

test("low-stock counts stay within the unit's decimals and a bounded size", () => {
  const kg = { inventoryUnitId: "kg", transactionScale: 2 }
  expect(publicLowStockQuantity([balance("kg", "1.25")], "3", kg)).toBe("1.25")
  // More precision than customers can order in this unit: no count.
  expect(publicLowStockQuantity([balance("kg", "1.255")], "3", kg)).toBe(
    undefined,
  )
  expect(
    publicLowStockQuantity([balance("kg", "1500000")], "2000000", {
      inventoryUnitId: "kg",
      transactionScale: 0,
    }),
  ).toBe(undefined)
})
