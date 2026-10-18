import { describe, expect, test } from "bun:test"
import type { OwnerSetupDraft } from "@ewatrade/utils/owner-signup"
import {
  arrangeOwnerTypes,
  emptyBusiness,
  initialOwnerDraft,
  storeReady,
} from "./model"

function draft(keys: string[]): OwnerSetupDraft {
  return {
    planId: "starter",
    selectedTypeKeys: keys,
    businesses: [
      { ...emptyBusiness("business-0"), name: "Kola", slug: "kola" },
    ],
  }
}

describe("web owner setup", () => {
  test("starts country and currency blank and restores server-owned first identity", () => {
    const result = initialOwnerDraft({
      tenantId: "tenant",
      emailDomain: "example.com",
      name: "Kola",
      slug: "kola",
      draft: {
        ...draft([]),
        businesses: [
          { ...emptyBusiness("business-0"), name: "Old", slug: "old" },
        ],
      },
    })
    expect(result.businesses[0]?.name).toBe("Kola")
    expect(result.businesses[0]?.slug).toBe("kola")
    expect(result.businesses[0]?.countryCode).toBe("")
    expect(result.businesses[0]?.currencyCode).toBe("")
    const first = result.businesses[0]
    if (!first) throw new Error("Missing first business")
    expect(storeReady(first)).toBe(false)
  })
  test("groups related types without moving the first business identity", () => {
    const result = arrangeOwnerTypes(
      draft(["supermarket", "foodstuff", "phones"]),
      "suggested",
    )
    expect(result.businesses.map((b) => b.typeKeys)).toEqual([
      ["supermarket", "foodstuff"],
      ["phones"],
    ])
    expect(result.businesses[0]?.name).toBe("Kola")
    expect(result.businesses[0]?.slug).toBe("kola")
    expect(new Set(result.businesses.map((b) => b.id)).size).toBe(2)
  })
  test("regroup preserves a matching extra business's edits and deliberate offer", () => {
    const initial = arrangeOwnerTypes(
      draft(["supermarket", "phones"]),
      "separate",
    )
    const extra = initial.businesses[1]
    if (!extra) throw new Error("Missing separate business")
    initial.businesses[1] = {
      ...extra,
      name: "Kola Phones",
      slug: "kola-phones",
      description: "Original phones",
      operatingModel: "services",
      offerTouched: true,
    }
    const result = arrangeOwnerTypes(initial, "suggested")
    expect(result.businesses[1]?.id).toBe(initial.businesses[1]?.id)
    expect(result.businesses[1]?.description).toBe("Original phones")
    expect(result.businesses[1]?.operatingModel).toBe("services")
  })
  test("merging types updates an untouched offer and keeps Other descriptive text", () => {
    const result = arrangeOwnerTypes(
      { ...draft(["supermarket", "other"]), otherType: "Shoe studio" },
      "together",
    )
    expect(result.businesses).toHaveLength(1)
    expect(result.businesses[0]?.otherType).toBe("Shoe studio")
    expect(result.businesses[0]?.operatingModel).toBe("products_and_services")
  })
})
