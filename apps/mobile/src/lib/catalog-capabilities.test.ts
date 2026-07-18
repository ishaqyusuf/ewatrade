import { describe, expect, test } from "bun:test"
import { deriveMobileCatalogFeatureAvailability } from "./catalog-capabilities"

describe("mobile catalog feature availability", () => {
  test("hides both operational entries before an item exists", () => {
    expect(deriveMobileCatalogFeatureAvailability([])).toEqual({
      hasProductItems: false,
      hasServiceItems: false,
    })
  })

  test("treats legacy items without a kind as Product", () => {
    expect(deriveMobileCatalogFeatureAvailability([{}])).toEqual({
      hasProductItems: true,
      hasServiceItems: false,
    })
  })

  test("enables only Services for a service-only catalog", () => {
    expect(
      deriveMobileCatalogFeatureAvailability([{ kind: "service" }]),
    ).toEqual({
      hasProductItems: false,
      hasServiceItems: true,
    })
  })

  test("enables both entries for mixed catalogs", () => {
    expect(
      deriveMobileCatalogFeatureAvailability([
        { kind: "product" },
        { kind: "service" },
      ]),
    ).toEqual({
      hasProductItems: true,
      hasServiceItems: true,
    })
  })
})
