import { expect, test } from "bun:test"
import { canonicalBusinessCountryCode } from "./business-country"

test("the business's own country wins over its Stores", () => {
  expect(canonicalBusinessCountryCode("gh", [{ countryCode: "NG" }])).toBe("GH")
})

test("without one, the oldest Store with a valid country is used", () => {
  expect(
    canonicalBusinessCountryCode(null, [
      { countryCode: null },
      { countryCode: " ke " },
      { countryCode: "NG" },
    ]),
  ).toBe("KE")
  expect(canonicalBusinessCountryCode("Nigeria", [{ countryCode: "NG" }])).toBe(
    "NG",
  )
})

test("no recorded country stays null so callers keep their fallback", () => {
  expect(canonicalBusinessCountryCode(undefined, [])).toBeNull()
  expect(canonicalBusinessCountryCode("", [{ countryCode: "N" }])).toBeNull()
})
