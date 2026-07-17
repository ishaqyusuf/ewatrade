import { describe, expect, test } from "bun:test"
import { createStoreSchema, tenantBootstrapSchema } from "./tenant"

function expectRejected(
  schema: { safeParse: (value: unknown) => { success: boolean } },
  value: unknown,
) {
  expect(schema.safeParse(value).success).toBe(false)
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
        businessType: " Retail ",
        countryCode: " ng ",
        productCategory: " Food staples ",
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
        businessType: "Retail",
        countryCode: "ng",
        productCategory: "Food staples",
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
          businessType: "   ",
          countryCode: "   ",
          productCategory: "   ",
          salesMethod: "   ",
          teamSize: "   ",
        },
        supportEmail: "   ",
        supportPhone: "   ",
      }),
    ).toEqual({
      name: "Warehouse",
      onboarding: {
        businessType: undefined,
        countryCode: undefined,
        productCategory: undefined,
        salesMethod: undefined,
        teamSize: undefined,
      },
      supportEmail: undefined,
      supportPhone: undefined,
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
  })
})
