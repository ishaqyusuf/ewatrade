import { expect, test } from "bun:test"
import { readGeneralOrderReview } from "./assistant-general"

test("order review names the selected customer choice even when it is the default variant", async () => {
  const db = {
    sellableOffering: {
      findFirst: async () => ({
        name: "Crate",
        fixedPriceMinor: 600000,
        pricingPolicy: "FIXED",
        kind: "PRODUCT_UNIT",
        catalogItem: { name: "Eggs" },
        variant: { name: "Big", isDefault: true, _count: { selections: 1 } },
        productUnitOffering: {
          inventoryUnit: { configurationVersionId: "v1" },
        },
      }),
    },
  } as unknown as Parameters<typeof readGeneralOrderReview>[0]
  const review = await readGeneralOrderReview(
    db,
    { tenantId: "tenant", storeId: "store", userId: "actor" },
    [
      {
        offeringId: "big-crate",
        quantity: "10",
        expectedFixedPriceMinor: 600000,
        expectedConfigurationVersionId: "v1",
      },
    ],
  )
  expect(review.rows[0]?.detail).toBe("Big · Crate")
  expect(review.lines[0]).toContain("Eggs · Big · Crate")
  expect(review.totalMinor).toBe(6000000)
})
