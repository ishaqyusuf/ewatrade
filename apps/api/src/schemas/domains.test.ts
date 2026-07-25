import { describe, expect, test } from "bun:test"

import {
  createDomainCheckoutSchema,
  domainAvailabilitySchema,
  domainRegistrantSchema,
} from "./domains"

describe("domain API schemas", () => {
  test("normalizes only the launch-supported domain extensions", () => {
    expect(
      domainAvailabilitySchema.parse({
        domain: " HTTPS://Acme.com.ng/store ",
        storeId: "store_1",
      }).domain,
    ).toBe("acme.com.ng")
    expect(
      domainAvailabilitySchema.safeParse({
        domain: "acme.net",
        storeId: "store_1",
      }).success,
    ).toBe(false)
  })

  test("accepts only the current registrant consent version", () => {
    const registrant = {
      addressLine1: "1 Marina Road",
      city: "Lagos",
      consentVersion: "2026-07-24",
      countryCode: "NG",
      email: "owner@example.com",
      firstName: "Ada",
      lastName: "Okafor",
      phoneCountryCode: "+234",
      phoneNumber: "8012345678",
      region: "Lagos",
    }

    expect(domainRegistrantSchema.safeParse(registrant).success).toBe(true)
    expect(
      domainRegistrantSchema.safeParse({
        ...registrant,
        consentVersion: "outdated",
      }).success,
    ).toBe(false)
  })

  test("rejects checkout without the current domain terms version", () => {
    const checkout = {
      idempotencyKey: "domain-checkout-order-1",
      quoteId: "quote_1",
      registrantProfileId: "profile_1",
      surface: "dashboard",
      termsVersion: "2026-07-24",
    }

    expect(createDomainCheckoutSchema.safeParse(checkout).success).toBe(true)
    expect(
      createDomainCheckoutSchema.safeParse({
        ...checkout,
        termsVersion: "outdated",
      }).success,
    ).toBe(false)
  })
})
