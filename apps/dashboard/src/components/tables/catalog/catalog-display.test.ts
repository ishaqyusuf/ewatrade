import { describe, expect, test } from "bun:test"

import { catalogItemDetail } from "./catalog-display"

describe("catalogItemDetail", () => {
  test("does not repeat a service item name", () => {
    expect(
      catalogItemDetail({
        itemName: "Strategy Consultation",
        offeringCount: 1,
        offeringName: "Strategy Consultation",
        variantName: "Strategy Consultation",
      }),
    ).toBe("1 offering")
  })

  test("keeps distinct variant and offering details once", () => {
    expect(
      catalogItemDetail({
        itemName: "Advisory Project",
        offeringCount: 1,
        offeringName: "Custom project",
        variantName: "Custom project",
      }),
    ).toBe("Custom project")
  })
})
