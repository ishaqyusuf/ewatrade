import { expect, test } from "bun:test"
import { createQaFixtureContext } from "@ewatrade/utils/qa-fixtures"
import { businessFill } from "./qa-fill-definitions"

const context = createQaFixtureContext({
  domain: "ishaq.qa.test",
  invocationId: "business-name-test",
  currencyCode: "NGN",
  seed: "business-name-test",
  storeId: "signup",
  tenantId: "signup",
  timezone: "Africa/Lagos",
})

test("business Quick Fill never supplies a business name, across repeated fills", () => {
  for (const sequence of [1, 2]) {
    const draft = businessFill(context, sequence)
    expect(draft).not.toHaveProperty("businessName")
    expect(draft.addressLine1).toBeTruthy()
    expect(draft.city).toBeTruthy()
    expect(draft.countryCode).toBe("NG")
    expect(draft.phone).toMatch(/^8000000\d{3}$/)
    expect(draft.businessProfileKey).toBe("general-retail-groceries")
  }
})

test("Quick Fill preserves existing names and leaves missing names for manual entry", () => {
  for (const existingName of ["Jawdah Poultry & Foods Ltd.", "My Shop", ""]) {
    let draft = { businessName: existingName }
    for (const sequence of [1, 2]) {
      draft = { ...draft, ...businessFill(context, sequence) }
      expect(draft.businessName).toBe(existingName)
    }
  }
})
