import { describe, expect, test } from "bun:test"
import {
  createBusinessSchema,
  createStoreSchema,
  tenantBootstrapSchema,
} from "./tenant"

function expectRejected(
  schema: { safeParse: (value: unknown) => { success: boolean } },
  value: unknown,
) {
  expect(schema.safeParse(value).success).toBe(false)
}

const validBusiness = {
  addressLine1: " 12 Market Road ",
  businessName: " Second Business ",
  city: " Lagos ",
  currencyCode: "ngn",
  onboarding: {
    businessProfileKey: "general-retail-groceries",
    businessProfileVersion: 1 as const,
    operatingModel: "products" as const,
    orderChannels: ["walk_in"] as ["walk_in"],
    teamSize: "2_5" as const,
  },
  supportPhone: " 08012345678 ",
}

describe("tenant schemas", () => {
  test("normalizes tenant bootstrap input", () => {
    expect(
      tenantBootstrapSchema.parse({
        tenantSlug: " rice-store ",
      }),
    ).toEqual({
      tenantSlug: "rice-store",
    })

    expect(
      tenantBootstrapSchema.parse({
        tenantSlug: "   ",
      }),
    ).toEqual({
      tenantSlug: undefined,
    })
  })

  test("normalizes store creation support and onboarding payloads", () => {
    const input = createStoreSchema.parse({
      currencyCode: " ngn ",
      name: " Main Branch ",
      onboarding: {
        businessProfileKey: " animal-feed-agricultural-supplies ",
        businessProfileVersion: 1,
        countryCode: " ng ",
        operatingModel: " products ",
        orderChannels: [" walk_in ", "phone_whatsapp"],
        salesMethod: " In store ",
        teamSize: "   ",
      },
      supportEmail: " SUPPORT@BUSINESS.TEST ",
      supportPhone: " 08000000000 ",
    })

    expect(input).toEqual({
      currencyCode: "NGN",
      name: "Main Branch",
      onboarding: {
        businessProfileKey: "animal-feed-agricultural-supplies",
        businessProfileVersion: 1,
        countryCode: "ng",
        operatingModel: "products",
        orderChannels: ["walk_in", "phone_whatsapp"],
        salesMethod: "In store",
        teamSize: undefined,
      },
      supportEmail: "support@business.test",
      supportPhone: "08000000000",
    })
  })

  test("treats blank optional store setup fields as absent", () => {
    expect(
      createStoreSchema.parse({
        name: "Warehouse",
        onboarding: {
          countryCode: "   ",
          salesMethod: "   ",
          teamSize: "   ",
        },
        supportEmail: "   ",
        supportPhone: "   ",
      }),
    ).toEqual({
      name: "Warehouse",
      onboarding: {
        countryCode: undefined,
        salesMethod: undefined,
        teamSize: undefined,
      },
      supportEmail: undefined,
      supportPhone: undefined,
    })
  })

  test("normalizes a complete new-business onboarding payload", () => {
    expect(createBusinessSchema.parse(validBusiness)).toEqual({
      addressLine1: "12 Market Road",
      businessName: "Second Business",
      city: "Lagos",
      currencyCode: "NGN",
      onboarding: validBusiness.onboarding,
      supportPhone: "08012345678",
    })
  })

  test("requires new-business identity, contact, and profile answers", () => {
    expectRejected(createBusinessSchema, {
      ...validBusiness,
      businessName: "",
    })
    expectRejected(createBusinessSchema, {
      ...validBusiness,
      supportPhone: "123",
    })
    expectRejected(createBusinessSchema, {
      ...validBusiness,
      onboarding: {
        ...validBusiness.onboarding,
        businessProfileKey: "unsupported-business",
      },
    })
  })

  test("rejects unsafe store setup payloads", () => {
    expectRejected(createStoreSchema, {
      currencyCode: "naira",
      name: "Main Branch",
    })
    expectRejected(createStoreSchema, {
      name: "Main Branch",
      supportEmail: "support@",
    })
    expectRejected(createStoreSchema, {
      name: "Main Branch",
      supportPhone: "1".repeat(41),
    })
    expectRejected(createStoreSchema, {
      name: "Main Branch",
      onboarding: {
        countryCode: "1".repeat(9),
      },
    })
    expectRejected(createStoreSchema, {
      name: "Main Branch",
      onboarding: {
        businessProfileKey: "dry_cleaning_runtime",
      },
    })
    expectRejected(createStoreSchema, {
      name: "Main Branch",
      onboarding: {
        businessProfileKey: "laundry-dry-cleaning",
        businessProfileVersion: 2,
      },
    })
    expectRejected(createStoreSchema, {
      name: "Main Branch",
      onboarding: {
        businessProfileKey: "other-mixed-business",
        businessProfileVersion: 1,
        operatingModel: "products",
        orderChannels: ["walk_in"],
        teamSize: "solo",
      },
    })
    expectRejected(createStoreSchema, {
      name: "Main Branch",
      onboarding: {
        operatingModel: "laundry_mode",
      },
    })
  })
})
