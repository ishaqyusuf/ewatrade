import { describe, expect, test } from "bun:test"
import {
  isBusinessProfileKey,
  readBusinessOnboardingFactsFromStoreMetadata,
} from "./business-profiles"
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_GROUPS,
  defaultBusinessOffer,
  groupBusinessTypes,
} from "./business-types"
import {
  isValidStoreLink,
  normalizeStoreLink,
  storeLinkSuggestions,
} from "./store-link"

describe("owner signup shared contracts", () => {
  test("normalizes links identically and excludes platform names", () => {
    expect(normalizeStoreLink("  Ẹwá & Sons  ")).toBe("ewa-sons")
    for (const value of [
      "www",
      "api",
      "admin",
      "store",
      "ewatrade",
      "a",
      "-shop",
      "a".repeat(41),
    ])
      expect(isValidStoreLink(value)).toBe(false)
    expect(isValidStoreLink("tolu-styles")).toBe(true)
    expect(storeLinkSuggestions("a".repeat(60)).every(isValidStoreLink)).toBe(
      true,
    )
  })
  test("catalog matches selected prototype and maps to existing profiles", () => {
    expect(BUSINESS_TYPES).toHaveLength(42)
    expect(BUSINESS_TYPE_GROUPS).toHaveLength(9)
    expect(new Set(BUSINESS_TYPES.map((t) => t.key)).size).toBe(42)
    expect(BUSINESS_TYPES.at(-1)?.key).toBe("other")
    expect(
      BUSINESS_TYPES.every((t) => isBusinessProfileKey(t.businessProfileKey)),
    ).toBe(true)
    expect(groupBusinessTypes(["poultry", "feed", "boutique"])).toEqual([
      ["poultry", "feed"],
      ["boutique"],
    ])
    expect(defaultBusinessOffer(["phones", "phone-repair"])).toBe(
      "products_and_services",
    )
  })
  test("metadata reader ignores unknown types and malformed private text", () => {
    const facts = readBusinessOnboardingFactsFromStoreMetadata({
      retailOps: {
        onboarding: {
          businessTypeKeys: ["other", "poultry", "unknown", "poultry", 3],
          otherBusinessType: " Event rentals ",
          setupStatus: "pending",
        },
      },
    })
    expect(facts?.businessTypeKeys).toEqual(["other", "poultry"])
    expect(facts?.otherBusinessType).toBe("Event rentals")
    expect(facts?.setupStatus).toBe("pending")
    expect(
      readBusinessOnboardingFactsFromStoreMetadata({
        retailOps: {
          onboarding: { setupStatus: "approved", otherBusinessType: "secret" },
        },
      })?.otherBusinessType,
    ).toBeNull()
  })
})
