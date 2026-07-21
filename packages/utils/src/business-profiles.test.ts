import { describe, expect, test } from "bun:test"

import { findCatalogSetupHelper } from "./catalog-setup-helpers"
import { listCatalogSetupHelpers } from "./catalog-setup-helpers"
import {
  BUSINESS_PROFILES,
  BUSINESS_PROFILE_SCHEMA_VERSION,
  BUSINESS_OPERATING_MODELS,
  findBusinessProfile,
  getRecommendedCatalogSetupHelperKeys,
  isBusinessProfileKey,
  listBusinessProfiles,
  rankCatalogSetupHelpersForBusinessProfile,
  readBusinessProfileKeyFromStoreMetadata,
} from "./business-profiles"

describe("business profiles", () => {
  test("publishes fifteen neutral, searchable onboarding profiles", () => {
    expect(BUSINESS_PROFILE_SCHEMA_VERSION).toBe(1)
    expect(BUSINESS_PROFILES).toHaveLength(15)

    const keys = BUSINESS_PROFILES.map((profile) => profile.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(BUSINESS_PROFILES.every((profile) => profile.tags.length > 0)).toBe(
      true,
    )

    expect(listBusinessProfiles({ query: "feed" })).toEqual([
      expect.objectContaining({ key: "animal-feed-agricultural-supplies" }),
    ])
    expect(listBusinessProfiles({ query: "garment" })).toEqual([
      expect.objectContaining({ key: "laundry-dry-cleaning" }),
    ])
  })

  test("maps feed and laundry profiles to relevant editable Catalog helpers", () => {
    expect(
      getRecommendedCatalogSetupHelperKeys({
        kind: "product",
        profileKey: "animal-feed-agricultural-supplies",
      }),
    ).toEqual(["feed-bag-50kg", "feed-bag-25kg", "prepared-portions"])
    expect(
      getRecommendedCatalogSetupHelperKeys({
        kind: "service",
        profileKey: "laundry-dry-cleaning",
      }),
    ).toEqual(["dry-cleaning-laundry", "tracked-fixed-service"])

    for (const profile of BUSINESS_PROFILES) {
      for (const helperKey of profile.recommendedHelperKeys) {
        expect(findCatalogSetupHelper(helperKey)).toBeDefined()
      }
    }
  })

  test("ranks profile-specific helpers ahead of generic recommendations", () => {
    const ranked = rankCatalogSetupHelpersForBusinessProfile(
      listCatalogSetupHelpers({ kind: "product" }),
      "animal-feed-agricultural-supplies",
    )

    expect(ranked.slice(0, 3).map((helper) => helper.key)).toEqual([
      "feed-bag-50kg",
      "feed-bag-25kg",
      "prepared-portions",
    ])
  })

  test("keeps category guidance separate from runtime Catalog behavior", () => {
    const laundry = findBusinessProfile("laundry-dry-cleaning")
    const feed = findBusinessProfile("animal-feed-agricultural-supplies")

    expect(laundry?.recommendedItemKinds).toEqual(["service"])
    expect(feed?.recommendedItemKinds).toEqual(["product"])
    expect(BUSINESS_OPERATING_MODELS).toEqual([
      { key: "products", label: "Products" },
      { key: "services", label: "Services" },
      { key: "products_and_services", label: "Products and services" },
    ])

    const serialized = JSON.stringify(BUSINESS_PROFILES)
    for (const forbidden of [
      "permissions",
      "enabledFeatures",
      "runtimeMode",
      "tenantId",
      "storeId",
    ]) {
      expect(serialized).not.toContain(`\"${forbidden}\"`)
    }
  })

  test("recognizes only supported stable profile keys", () => {
    expect(isBusinessProfileKey("professional-services")).toBe(true)
    expect(isBusinessProfileKey("dry_cleaning_runtime")).toBe(false)
    expect(findBusinessProfile("unknown-profile")).toBeUndefined()
    expect(
      getRecommendedCatalogSetupHelperKeys({
        kind: "product",
        profileKey: "unknown-profile",
      }),
    ).toEqual([])
  })

  test("reads only a valid descriptive profile from Store onboarding metadata", () => {
    expect(
      readBusinessProfileKeyFromStoreMetadata({
        retailOps: {
          onboarding: {
            businessProfileKey: "laundry-dry-cleaning",
            businessProfileVersion: 1,
          },
        },
      }),
    ).toBe("laundry-dry-cleaning")
    expect(
      readBusinessProfileKeyFromStoreMetadata({
        retailOps: {
          onboarding: { businessProfileKey: "dry_cleaning_runtime" },
        },
      }),
    ).toBeNull()
  })
})
