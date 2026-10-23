import { expect, test } from "bun:test"
import {
  publicItemAvailability,
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
