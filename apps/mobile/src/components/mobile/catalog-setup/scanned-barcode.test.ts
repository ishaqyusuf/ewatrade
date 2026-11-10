import { describe, expect, it } from "bun:test"
import type { CatalogVariantDraft } from "./catalog-variant-model"
import { placeScannedBarcode } from "./scanned-barcode"

const blank: CatalogVariantDraft = {
  barcode: "",
  description: "",
  enabled: true,
  imageUrl: "",
  price: "",
  quantity: "",
  quoteRequired: false,
  sku: "",
  storeIds: ["store-1"],
  unitPrices: {},
}

describe("placeScannedBarcode", () => {
  it("creates the chosen draft with the code", () => {
    expect(placeScannedBarcode({}, "default", "6151", blank)).toEqual({
      default: { ...blank, barcode: "6151" },
    })
  })

  it("moves the code so only one choice holds it", () => {
    const next = placeScannedBarcode(
      {
        small: { ...blank, barcode: "6151", sku: "EGG-200" },
        large: { ...blank, price: "900" },
      },
      "large",
      "6151",
      blank,
    )
    expect(next.small).toEqual({ ...blank, barcode: "", sku: "EGG-200" })
    expect(next.large).toEqual({ ...blank, barcode: "6151", price: "900" })
    expect(
      Object.values(next).filter((draft) => draft.barcode === "6151"),
    ).toHaveLength(1)
  })

  it("keeps other choices' own barcodes", () => {
    const next = placeScannedBarcode(
      { small: { ...blank, barcode: "9990" } },
      "large",
      "6151",
      blank,
    )
    expect(next.small?.barcode).toBe("9990")
    expect(next.large?.barcode).toBe("6151")
  })
})
