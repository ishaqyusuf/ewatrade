import { expect, test } from "bun:test"
import { onboardingDraftSchema } from "@ewatrade/db/onboarding-continuation"
import { directSignupSchema, websiteSignupSchema } from "./direct-signup-schema"
import {
  normalizeInternationalPhone,
  phoneCountry,
  phonePlaceholder,
} from "./international-phone"
import {
  businessValuesFromOnboardingDraft,
  onboardingDraftFromBusinessValues,
} from "./onboarding-draft"
import { businessSchema } from "./signup-schemas"

test("normalizes national, pasted international and significant leading zeros", () => {
  expect(normalizeInternationalPhone("0803 123 4567", "NG")).toBe(
    "+2348031234567",
  )
  expect(normalizeInternationalPhone("0044 7400 123456", "GB")).toBe(
    "+447400123456",
  )
  expect(normalizeInternationalPhone("+225 07 01 23 45 67", "CI")).toBe(
    "+2250701234567",
  )
})

test("rejects invalid numbers, extensions and mismatched countries", () => {
  expect(normalizeInternationalPhone("123", "NG")).toBeNull()
  expect(normalizeInternationalPhone("+447400123456", "NG")).toBeNull()
  expect(normalizeInternationalPhone("+14165550123", "US")).toBeNull()
  expect(normalizeInternationalPhone("+12133734253 ext 3", "US")).toBeNull()
  expect(phoneCountry("XX")).toBeUndefined()
  expect(phoneCountry("ng")).toBe("NG")
})

test("placeholders contain only zeros and country-specific separators", () => {
  expect(phonePlaceholder("NG")).toBe("000 000 0000")
  expect(phonePlaceholder("US")).toBe("000 000 0000")
  expect(phonePlaceholder("GB")).toBe("0000 000000")
})

test("web requires a number; country-aware server input normalizes it; old native requests remain compatible", () => {
  const base = {
    fullName: "Test Owner",
    businessName: "Test Store",
    email: "owner@example.com",
  }
  expect(
    websiteSignupSchema.safeParse({ ...base, phone: "", phoneCountry: "" })
      .success,
  ).toBe(false)
  expect(directSignupSchema.safeParse(base).success).toBe(true)
  expect(
    directSignupSchema.safeParse({ ...base, phoneCountry: "NG", phone: "123" })
      .success,
  ).toBe(false)
  expect(
    directSignupSchema.parse({
      ...base,
      phoneCountry: "NG",
      phone: "0803 123 4567",
    }).phone,
  ).toBe("+2348031234567")
})

test("resumed drafts retain a phone country independent of business location", () => {
  const draft = onboardingDraftSchema.parse({
    phoneCountry: "GB",
    phone: "+447400123456",
    countryCode: "NG",
  })
  const values = businessValuesFromOnboardingDraft(draft)
  const result = businessSchema.safeParse({
    ...values,
    businessName: "Test Store",
    addressLine1: "123 Test Street",
    city: "Lagos",
    businessProfileKey: "other-mixed-business",
    businessProfileVersion: 1,
    otherBusinessDescription: "General store",
    businessSize: "solo",
    currencyCode: "NGN",
    operatingModel: "products",
    orderChannels: ["walk_in"],
  })
  expect(result.success).toBe(true)
  if (!result.success) throw result.error
  const saved = onboardingDraftFromBusinessValues(result.data)
  expect(saved.phoneCountry).toBe("GB")
  expect(saved.countryCode).toBe("NG")
  expect(saved.phone).toBe("+447400123456")
})
