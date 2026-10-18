import { expect, test } from "bun:test"
import {
  ownerSignupCompletionSchema,
  ownerSignupDraftSchema,
} from "./owner-signup"
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
    ownerSignupCompletionSchema.safeParse({
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
      ownerSignupCompletionSchema.safeParse({
        planId: "starter",
        businesses: [{ ...business, ...change }],
      }).success,
    ).toBe(false)
})
test("setup rejects duplicate business links and duplicated types across cards", () => {
  expect(
    ownerSignupCompletionSchema.safeParse({
      planId: "growth",
      businesses: [business, { ...business, typeKeys: ["feed"] }],
    }).success,
  ).toBe(false)
  expect(
    ownerSignupCompletionSchema.safeParse({
      planId: "growth",
      businesses: [business, { ...business, slug: "another-link" }],
    }).success,
  ).toBe(false)
})

test("draft saves partial grouping and resume data while completion rejects it", () => {
  const draft = {
    planId: "growth",
    step: "group",
    storeIndex: 0,
    groupedFor: "poultry,feed",
    selectedTypeKeys: ["poultry", "feed"],
    businesses: [
      { ...business, id: "business-0", typeKeys: [] },
      { ...business, id: "business-1", name: "", slug: "", typeKeys: ["feed"] },
    ],
  }
  expect(ownerSignupDraftSchema.safeParse(draft).success).toBe(true)
  expect(ownerSignupCompletionSchema.safeParse(draft).success).toBe(false)
})
