import { describe, expect, test } from "bun:test"
import { deriveCatalogFeatureAvailability } from "./catalog-capabilities"

describe("catalog feature availability", () => {
  test("keeps Sales and Service jobs hidden for an empty catalog", () => {
    expect(deriveCatalogFeatureAvailability([])).toEqual({
      hasProductItems: false,
      hasServiceItems: false,
    })
  })

  test("enables only the feature matching the configured item kind", () => {
    expect(deriveCatalogFeatureAvailability(["PRODUCT"])).toEqual({
      hasProductItems: true,
      hasServiceItems: false,
    })
    expect(deriveCatalogFeatureAvailability(["SERVICE"])).toEqual({
      hasProductItems: false,
      hasServiceItems: true,
    })
  })

  test("enables both features for a mixed catalog", () => {
    expect(deriveCatalogFeatureAvailability(["PRODUCT", "SERVICE"])).toEqual({
      hasProductItems: true,
      hasServiceItems: true,
    })
  })
})
