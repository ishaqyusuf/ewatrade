import { describe, expect, test } from "bun:test"

import { offlineCommandPayloadSchema } from "./offline"

describe("offline Product setup payload", () => {
  test("accepts a Product without a price or opening quantity", () => {
    const result = offlineCommandPayloadSchema.parse({
      canonicalUnitName: "Bag",
      kind: "product_setup",
      name: "Rabbit feed",
    })

    expect(result.kind).toBe("product_setup")
    if (result.kind !== "product_setup") return
    expect(result.priceMinor).toBeUndefined()
    expect(result.openingStockQuantity).toBeUndefined()
  })
})
