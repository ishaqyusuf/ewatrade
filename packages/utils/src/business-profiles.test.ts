import { describe, expect, test } from "bun:test"

import {
  BUSINESS_OPERATING_MODELS,
  BUSINESS_PROFILES,
  BUSINESS_PROFILE_SCHEMA_VERSION,
  findBusinessProfile,
  getRecommendedCatalogSetupHelperKeys,
  isBusinessProfileKey,
  listBusinessProfiles,
  rankCatalogSetupHelpersForBusinessProfile,
  readBusinessOnboardingFactsFromStoreMetadata,
  readBusinessProfileKeyFromStoreMetadata,
} from "./business-profiles"
import { findCatalogSetupHelper } from "./catalog-setup-helpers"
import { listCatalogSetupHelpers } from "./catalog-setup-helpers"

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
    ).toEqual([
      "farm-eggs-tray",
      "farm-live-poultry",
      "farm-produce-weight",
      "feed-bag-50kg",
      "feed-bag-25kg",
      "fertilizer-bag",
      "seed-packets",
      "prepared-portions",
    ])
    expect(
      getRecommendedCatalogSetupHelperKeys({
        kind: "service",
        profileKey: "laundry-dry-cleaning",
      }),
    ).toEqual(["dry-cleaning-laundry", "ironing-only", "tracked-fixed-service"])

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
      "farm-eggs-tray",
      "farm-live-poultry",
      "farm-produce-weight",
    ])
  })

  test("every supported business and item kind has a tagged concrete example", () => {
    for (const profile of BUSINESS_PROFILES) {
      for (const kind of profile.recommendedItemKinds) {
        const keys = getRecommendedCatalogSetupHelperKeys({
          kind,
          profileKey: profile.key,
        })
        const helpers = keys.map((key) => findCatalogSetupHelper(key))
        const examples = helpers.filter(
          (helper) => helper?.classification === "example",
        )
        expect(examples.length).toBeGreaterThan(0)
        for (const example of examples) {
          expect(example?.businessProfileKeys).toContain(profile.key)
          expect(example?.kind).toBe(kind)
        }
        expect(helpers[0]?.classification).toBe("example")
      }
    }
  })

  test("electronics recommendations use phones and chargers instead of apparel", () => {
    const keys = getRecommendedCatalogSetupHelperKeys({
      kind: "product",
      profileKey: "electronics-phone-shops",
    })
    expect(keys.slice(0, 2)).toEqual([
      "phone-storage-colour",
      "charger-connector",
    ])
    expect(keys).not.toContain("apparel-size-colour")
    expect(
      listBusinessProfiles({ query: "farm" }).map((profile) => profile.key),
    ).toContain("animal-feed-agricultural-supplies")
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

  test("reads only validated descriptive onboarding facts for recommendations", () => {
    expect(
      readBusinessOnboardingFactsFromStoreMetadata({
        retailOps: {
          onboarding: {
            businessProfileKey: "fashion-apparel",
            operatingModel: "products",
            orderChannels: ["phone_whatsapp", "walk_in", "phone_whatsapp"],
            teamSize: "6_10",
          },
        },
      }),
    ).toEqual({
      businessProfileKey: "fashion-apparel",
      operatingModel: "products",
      orderChannels: ["phone_whatsapp", "walk_in"],
      teamSize: "6_10",
    })

    expect(
      readBusinessOnboardingFactsFromStoreMetadata({
        retailOps: {
          onboarding: {
            businessProfileKey: "retired-profile",
            operatingModel: "runtime_mode",
            orderChannels: ["whatsapp_enabled", "phone_whatsapp", 42],
            teamSize: "enterprise",
          },
        },
      }),
    ).toEqual({
      businessProfileKey: null,
      operatingModel: null,
      orderChannels: ["phone_whatsapp"],
      teamSize: null,
    })

    expect(readBusinessOnboardingFactsFromStoreMetadata(null)).toBeNull()
  })
})
