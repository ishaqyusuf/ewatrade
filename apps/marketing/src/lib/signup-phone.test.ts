import { expect, test } from "bun:test"
import { businessFill } from "./qa-fill-definitions"
import { createLeadDraft } from "./qa-lead-fill"
import {
  getCountryCallingCode,
  getNationalSignupPhone,
  getSignupPhoneForCountry,
  resolveSignupPhone,
} from "./signup-phone"
import { businessSchema, signupPayloadSchema } from "./signup-schemas"

test("local and pasted international numbers resolve to one country prefix", () => {
  for (const [country, local, expected] of [
    ["NG", "0801 234 5678", "+2348012345678"],
    ["GH", "020 123 4567", "+233201234567"],
    ["KE", "0712 345678", "+254712345678"],
    ["CI", "0701234567", "+2250701234567"],
    ["SN", "771234567", "+221771234567"],
  ] as const) {
    expect(resolveSignupPhone(local, country)).toBe(expected)
    expect(resolveSignupPhone(expected, country)).toBe(expected)
    expect(resolveSignupPhone(expected.replace(/^\+/, "00"), country)).toBe(
      expected,
    )
    expect(getNationalSignupPhone(expected, country)).toBe(
      expected.slice(getCountryCallingCode(country).length),
    )
  }
})

test("all selectable countries have prefixes; Other retains a manually entered country code", () => {
  for (const country of [
    "NG",
    "GH",
    "KE",
    "ZA",
    "EG",
    "TZ",
    "UG",
    "SN",
    "CI",
    "ET",
  ])
    expect(getCountryCallingCode(country)).toMatch(/^\+\d+$/)
  expect(getCountryCallingCode("OTHER")).toBe("")
  expect(resolveSignupPhone("+44 20 7946 0000", "OTHER")).toBe("+442079460000")
  expect(resolveSignupPhone("442079460000", "OTHER")).toBe("+442079460000")
})

test("conflicting international prefixes, missing country, malformed and oversized numbers fail", () => {
  expect(resolveSignupPhone("+233201234567", "NG")).toBeNull()
  expect(resolveSignupPhone("08012345678", "")).toBeNull()
  expect(resolveSignupPhone("not-a-number", "NG")).toBeNull()
  expect(resolveSignupPhone("9".repeat(20), "NG")).toBeNull()
})

const business = {
  addressLine1: "12 Sample Road",
  businessName: "Sample Goods",
  businessProfileKey: "general-retail-groceries",
  businessProfileVersion: 1,
  businessSize: "solo",
  city: "Accra",
  countryCode: "GH",
  currencyCode: "GHS",
  phone: "0201234567",
  operatingModel: "products",
  orderChannels: ["walk_in"],
}
test("country changes preserve national digits without repeating Other's explicit code", () => {
  expect(getSignupPhoneForCountry("+233201234567", "GH", "NG")).toBe(
    "201234567",
  )
  const other = getSignupPhoneForCountry("0201234567", "GH", "OTHER")
  expect(other).toBe("+233201234567")
  expect(getSignupPhoneForCountry(other, "OTHER", "GH")).toBe("201234567")
  expect(getSignupPhoneForCountry("233201234567", "OTHER", "GH")).toBe(
    "201234567",
  )
  expect(getSignupPhoneForCountry("", "OTHER", "GH")).toBe("")
  expect(getSignupPhoneForCountry("+12025550101", "OTHER", "GH")).toBe(
    "+12025550101",
  )
})
test("both the business form and server signup payload normalize phone numbers", () => {
  const form = businessSchema.parse(business)
  expect(form.phone).toBe("+233201234567")
  const owner = {
    ageBand: "ADULT",
    subdomain: "sample",
    firstName: "Ada",
    lastName: "Okafor",
    email: "owner@example.com",
    password: "SyntheticFixture123!",
  }
  expect(signupPayloadSchema.parse({ ...business, ...owner }).phone).toBe(
    form.phone,
  )
  expect(signupPayloadSchema.parse({ ...form, ...owner }).phone).toBe(
    form.phone,
  )
  expect(
    businessSchema.safeParse({ ...business, phone: "+2348012345678" }).success,
  ).toBe(false)
})

test("QA business fill selects Nigeria with national digits and one matching prefix", () => {
  const fixture = businessFill(
    {
      currencyCode: "NGN",
      domain: "ishaq.qa.test",
      invocationId: "signup-phone-test",
      now: new Date("2026-10-01T00:00:00Z"),
      seed: "signup-phone",
      storeId: "",
      tenantId: "",
      timezone: "Africa/Lagos",
    },
    1,
  )
  expect(fixture.countryCode).toBe("NG")
  expect(fixture.phone).toMatch(/^8000000\d{3}$/)
  const parsed = businessSchema.parse({
    businessName: "Existing QA business",
    ...fixture,
  })
  expect(parsed.phone).toBe(`+234${fixture.phone}`)
  expect(resolveSignupPhone(parsed.phone, "NG")).toBe(parsed.phone)
  expect(getNationalSignupPhone(parsed.phone, "NG")).toBe(fixture.phone)
})

test("QA request fill uses the same country and prefix convention as business setup", () => {
  const fixture = createLeadDraft({
    domain: "ishaq.qa.test",
    testerIdentity: "phone-test",
  })
  expect(fixture.countryCode).toBe("NG")
  expect(getCountryCallingCode(fixture.countryCode)).toBe("+234")
  expect(fixture.phone).toMatch(/^8000000\d{3}$/)
  expect(resolveSignupPhone(fixture.phone, fixture.countryCode)).toBe(
    `+234${fixture.phone}`,
  )
})
