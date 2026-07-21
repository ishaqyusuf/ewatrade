import { describe, expect, test } from "bun:test"

import { businessSchema, signupPayloadSchema } from "./signup-schemas"

const BUSINESS_INPUT = {
  addressLine1: "12 Market Road",
  businessName: "Bird Feed Store",
  businessProfileKey: "animal-feed-agricultural-supplies",
  businessProfileVersion: 1 as const,
  businessSize: "2_5" as const,
  city: "Lagos",
  countryCode: "NG",
  currencyCode: "NGN" as const,
  operatingModel: "products" as const,
  orderChannels: ["walk_in", "phone_whatsapp"] as const,
  otherBusinessDescription: "",
  phone: "+2348012345678",
  region: "Lagos",
}

describe("business signup schemas", () => {
  test("accepts a supported profile and personalization answers", () => {
    expect(businessSchema.parse(BUSINESS_INPUT)).toMatchObject({
      businessProfileKey: "animal-feed-agricultural-supplies",
      businessProfileVersion: 1,
      operatingModel: "products",
      orderChannels: ["walk_in", "phone_whatsapp"],
      businessSize: "2_5",
    })

    expect(
      signupPayloadSchema.parse({
        ...BUSINESS_INPUT,
        email: "owner@example.com",
        firstName: "Ada",
        lastName: "Nwosu",
        password: "password123",
        subdomain: "bird-feed-store",
      }),
    ).toMatchObject({
      businessProfileKey: "animal-feed-agricultural-supplies",
      operatingModel: "products",
    })
  })

  test("rejects unknown categories and requires a description for Other", () => {
    expect(
      businessSchema.safeParse({
        ...BUSINESS_INPUT,
        businessProfileKey: "unsupported-industry",
      }).success,
    ).toBe(false)
    expect(
      businessSchema.safeParse({
        ...BUSINESS_INPUT,
        businessProfileKey: "other-mixed-business",
        otherBusinessDescription: "",
      }).success,
    ).toBe(false)
  })
})
