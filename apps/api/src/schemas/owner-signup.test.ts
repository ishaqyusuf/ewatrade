import { expect, test } from "bun:test"
import { ownerSignupDraftSchema } from "./owner-signup"
const business = {
  name: "Tolu",
  slug: "tolu",
  typeKeys: ["poultry"],
  operatingModel: "products",
  countryCode: "NG",
  currencyCode: "NGN",
}
test("setup accepts only supported types and explicit country/currency", () => {
  expect(
    ownerSignupDraftSchema.safeParse({
      planId: "starter",
      businesses: [business],
    }).success,
  ).toBe(true)
  for (const change of [
    { typeKeys: ["unknown"] },
    { countryCode: "" },
    { currencyCode: "XYZ" },
    { slug: "api" },
    { typeKeys: ["other"], otherType: "a" },
    { description: "a".repeat(281) },
  ])
    expect(
      ownerSignupDraftSchema.safeParse({
        planId: "starter",
        businesses: [{ ...business, ...change }],
      }).success,
    ).toBe(false)
})
test("setup rejects duplicate business links and duplicated types across cards", () => {
  expect(
    ownerSignupDraftSchema.safeParse({
      planId: "growth",
      businesses: [business, { ...business, typeKeys: ["feed"] }],
    }).success,
  ).toBe(false)
  expect(
    ownerSignupDraftSchema.safeParse({
      planId: "growth",
      businesses: [business, { ...business, slug: "another-link" }],
    }).success,
  ).toBe(false)
})
