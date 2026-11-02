import { expect, test } from "bun:test"
import { businessCountryCode } from "./business-country"

test("pickers start on the signed business country, then the local one", () => {
  expect(businessCountryCode("gh", "Kenya")).toBe("GH")
  expect(businessCountryCode(undefined, "Kenya")).toBe("KE")
  expect(businessCountryCode("", "KE")).toBe("KE")
  expect(businessCountryCode("ZZ", null)).toBe("NG")
  expect(businessCountryCode()).toBe("NG")
})
