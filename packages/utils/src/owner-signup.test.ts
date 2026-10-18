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
  isClaimableStoreLink,
  isValidStoreLink,
  normalizeStoreLink,
  storeLinkSuggestions,
} from "./store-link"

describe("owner signup shared contracts", () => {
  test("normalizes links identically and excludes platform names", () => {
    expect(normalizeStoreLink("  Ẹwá & Sons  ")).toBe("ewa-sons")
    for (const value of [
      "mama-pos",
      "mama-dashboard",
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
    expect(isClaimableStoreLink("tolu-qa", false)).toBe(false)
    expect(isClaimableStoreLink("tolu-qa", true)).toBe(true)
    expect(isClaimableStoreLink("tolu", false)).toBe(true)
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

test("saved drafts and moving types preserve first-business identity and recompute offers", async () => {
  const { readOwnerSignupDraft, moveOwnerBusinessType } = await import(
    "./owner-signup"
  )
  const draft = readOwnerSignupDraft({
    planId: "growth",
    businesses: [
      {
        name: "Tolu",
        slug: "tolu",
        typeKeys: ["phones"],
        operatingModel: "products",
        countryCode: "NG",
        currencyCode: "NGN",
      },
      {
        name: "Repairs",
        slug: "repairs",
        typeKeys: ["phone-repair"],
        operatingModel: "services",
        countryCode: "NG",
        currencyCode: "NGN",
      },
    ],
  })
  expect(draft).not.toBeNull()
  const moved = moveOwnerBusinessType(
    draft?.businesses ?? [],
    "phone-repair",
    0,
  )
  expect(moved).toHaveLength(1)
  expect(moved[0]?.slug).toBe("tolu")
  expect(moved[0]?.operatingModel).toBe("products_and_services")
  const separate = moveOwnerBusinessType(moved, "phones", "new")
  expect(separate[0]?.slug).toBe("tolu")
  expect(separate[1]?.name).toBe("")
  expect(
    readOwnerSignupDraft({
      planId: "growth",
      businesses: [
        {
          name: "Tolu",
          slug: "api",
          typeKeys: ["phones"],
          operatingModel: "products",
          countryCode: "NG",
          currencyCode: "NGN",
        },
      ],
    }),
  ).toBeNull()
})

test("launch tiers require matching multi-business choices and resync after grouping edits", async () => {
  const { ownerSignupLaunchPlan, syncOwnerSignupPlan } = await import(
    "./owner-signup"
  )
  expect(ownerSignupLaunchPlan("pro", 1)).toBe("starter")
  expect(ownerSignupLaunchPlan("pro", 3)).toBe("starter")
  expect(ownerSignupLaunchPlan("growth", 2)).toBe("growth")
  expect(ownerSignupLaunchPlan("growth", 4)).toBe("starter")
  expect(ownerSignupLaunchPlan("pro", 4)).toBe("pro")
  expect(syncOwnerSignupPlan("growth", 4)).toBe("pro")
  expect(syncOwnerSignupPlan("pro", 2)).toBe("growth")
  expect(syncOwnerSignupPlan("pro", 1)).toBe("starter")
})

test("changed selections preserve edited cards and merge new types into their suggested group", async () => {
  const { reconcileOwnerBusinessTypes } = await import("./owner-signup")
  const first = {
    id: "first",
    name: "Tolu",
    slug: "tolu",
    typeKeys: ["poultry"],
    operatingModel: "services" as const,
    offerTouched: true,
    countryCode: "NG",
    currencyCode: "NGN" as const,
  }
  const second = {
    ...first,
    id: "edited",
    name: "Styles",
    slug: "styles",
    typeKeys: ["boutique"],
    description: "Our store",
  }
  const result = reconcileOwnerBusinessTypes(
    [first, second],
    ["poultry", "feed", "boutique"],
    first,
    "",
  )
  const initial = reconcileOwnerBusinessTypes(
    [],
    ["poultry", "boutique"],
    { ...first, id: "business-0", typeKeys: [] },
    "",
  )
  expect(new Set(initial.map((b) => b.id)).size).toBe(initial.length)
  expect(result[0]?.typeKeys).toEqual(["poultry", "feed"])
  expect(result[0]?.operatingModel).toBe("services")
  expect(result[1]).toEqual(second)
  const removed = reconcileOwnerBusinessTypes(
    result,
    ["feed", "boutique"],
    first,
    "",
  )
  expect(removed[0]?.typeKeys).toEqual(["feed"])
  expect(removed[1]?.slug).toBe("styles")
})
