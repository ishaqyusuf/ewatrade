import { describe, expect, test } from "bun:test"
import {
  catalogCreateProductSchema,
  catalogCreateSimpleProductSchema,
  catalogListItemsPageSchema,
} from "./catalog"

function productInput() {
  return {
    clientOperationId: "catalog-test-operation",
    kind: "product" as const,
    name: "T-Shirt",
    unitConfiguration: {
      canonicalBalanceScale: 0,
      units: [
        {
          factor: "1",
          key: "piece",
          name: "Piece",
          stockBehavior: "canonical_shared" as const,
          transactionScale: 0,
        },
      ],
    },
    variants: [
      {
        description: "  Large red shirt  ",
        imageUrl: "https://example.com/large-red.jpg",
        isDefault: true,
        key: "large-red",
        name: "Large · Red",
        offerings: [
          {
            fixedPriceMinor: 5_000,
            inventoryUnitKey: "piece",
            key: "large-red-piece",
            name: "Large · Red",
            pricingPolicy: "fixed" as const,
          },
        ],
        openingStockQuantity: "12.50",
      },
    ],
  }
}

describe("catalog Product variant input", () => {
  test("accepts cursor pagination and a catalog search query", () => {
    const result = catalogListItemsPageSchema.parse({
      cursor: "catalog-cursor-1",
      kind: "product",
      limit: 20,
      query: "rabbit feed",
    })

    expect(result.cursor).toBe("catalog-cursor-1")
    expect(result.query).toBe("rabbit feed")
  })
  test("accepts optional variant details and exact opening quantity", () => {
    const result = catalogCreateProductSchema.parse(productInput())

    expect(result.variants[0]?.description).toBe("Large red shirt")
    expect(result.variants[0]?.imageUrl).toBe(
      "https://example.com/large-red.jpg",
    )
    expect(String(result.variants[0]?.openingStockQuantity)).toBe("12.5")
  })

  test("rejects an invalid variant opening quantity", () => {
    const input = productInput()
    const variant = input.variants[0]
    if (!variant) throw new Error("Expected a Product variant fixture.")
    variant.openingStockQuantity = "twelve"

    expect(() => catalogCreateProductSchema.parse(input)).toThrow(
      "plain decimal string",
    )
  })

  test("accepts an advanced Product offering without a price", () => {
    const input = productInput()
    const offering = input.variants[0]?.offerings[0]
    if (!offering) throw new Error("Expected a Product offering fixture.")
    Reflect.deleteProperty(offering, "fixedPriceMinor")

    const result = catalogCreateProductSchema.parse(input)

    expect(result.variants[0]?.offerings[0]?.fixedPriceMinor).toBeUndefined()
  })

  test("accepts a simple Product without a price or opening quantity", () => {
    const result = catalogCreateSimpleProductSchema.parse({
      canonicalUnitName: "Bag",
      clientOperationId: "catalog-simple-no-price",
      kind: "product",
      name: "Rabbit feed",
    })

    expect(result.priceMinor).toBeUndefined()
    expect(result.openingStockQuantity).toBeUndefined()
  })
})
